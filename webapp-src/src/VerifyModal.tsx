import { useEffect, useState } from 'react';
import { Button, Preloader, Sheet } from 'konsta/react';
import { ensureSignedIn } from './supabase';
import { confirmVerification, getVerification, type VerificationInfo } from './verification';
import { getCloudKitContainer, ownsGoalWithVerificationCode, recordAdWatchedForVerificationBypass } from './cloudkit';
import type { CloudKitAuthState } from './useCloudKitAuth';
import { formatDeadline, formatStakeCents, mapRecord, type Goal } from './useGoals';
import { ADS_REQUIRED_FOR_VERIFICATION_BYPASS, AD_PLACEMENTS } from './adsConfig';
import { useRewardedAd } from './useRewardedAd';
import { CheckCircleIcon, XMarkIcon } from './icons';

type ConfirmState = 'idle' | 'confirming' | 'confirmed' | 'error';

/// The signed-in person's own goal for this token, or null if it isn't theirs — `undefined`
/// while the check is still running (mirrors VerifyGoalView's `matchingLocalTask` being an
/// optional whose absence and "not looked up yet" are distinguished by `isLoading`).
type OwnedGoal = Goal | null | undefined;

/// Opens as a bottom sheet over the Goals tab (mirrors VerifyGoalView being presented as a
/// sheet over the app's main task list on iOS) — never a separate page, and closing it
/// (✕, backdrop tap, or the 1.5s auto-close right after confirming) always leaves the Goals
/// tab underneath untouched. The Apple sign-in button lives in the app's navbar, not in here,
/// since it stays reachable while this sheet is open (a bottom sheet doesn't cover it) — see
/// AppleSignInButton's comment for why there's only ever one such element on the page.
export function VerifyModal({
  token,
  authStatus,
  onClose,
  onGoalUpdated,
}: {
  token: string | null;
  authStatus: CloudKitAuthState['status'];
  onClose: () => void;
  /// Called when the self-confirm ad bypass writes to the signed-in person's own goal, so the
  /// Goals tab behind this sheet can update optimistically like every other write does.
  onGoalUpdated?: (goal: Goal) => void;
}) {
  const [info, setInfo] = useState<VerificationInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ownedGoal, setOwnedGoal] = useState<OwnedGoal>(undefined);
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [confirmErrorMessage, setConfirmErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setInfo(null);
    setLoadError(false);
    setOwnedGoal(undefined);
    setConfirmState('idle');
    setConfirmErrorMessage(null);
    let cancelled = false;
    (async () => {
      try {
        await ensureSignedIn();
        const result = await getVerification(token);
        if (!cancelled) setInfo(result);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /// Mirrors VerifyGoalView.matchingLocalTask on iOS (see cloudkit.ts's
  /// ownsGoalWithVerificationCode) — only runs once info says the goal isn't already
  /// verified and the person is actually signed in.
  useEffect(() => {
    if (!token || !info || info.is_verified || authStatus !== 'signed-in') return;
    let cancelled = false;
    (async () => {
      try {
        const owned = await ownsGoalWithVerificationCode(getCloudKitContainer(), token);
        if (!cancelled) setOwnedGoal(owned);
      } catch {
        // Fail open to the Confirm button rather than blocking a real friend just because the
        // self-check couldn't run.
        if (!cancelled) setOwnedGoal(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, info, authStatus]);

  // Only auto-closes right after the person's own tap confirms it — matches VerifyGoalView's
  // onChange(of: didConfirm), which doesn't auto-dismiss when the screen loads already-verified.
  useEffect(() => {
    if (confirmState !== 'confirmed') return;
    const timer = setTimeout(onClose, 1500);
    return () => clearTimeout(timer);
  }, [confirmState, onClose]);

  async function handleConfirm() {
    if (!token) return;
    setConfirmState('confirming');
    setConfirmErrorMessage(null);
    try {
      const result = await confirmVerification(token);
      if (result === 'confirmed' || result === 'already_confirmed') {
        setConfirmState('confirmed');
      } else {
        setConfirmState('error');
        setConfirmErrorMessage('This link may have expired or is no longer valid.');
      }
    } catch {
      setConfirmState('error');
      setConfirmErrorMessage("Couldn't confirm right now. Please try again.");
    }
  }

  /// The bypass writes to the same goal this sheet is showing, so its counter has to be kept
  /// current locally too — otherwise every watch would re-read the pre-write count and the
  /// progress would never move.
  function handleBypassGoalUpdated(goal: Goal) {
    setOwnedGoal(goal);
    onGoalUpdated?.(goal);
  }

  return (
    <Sheet opened={token != null} onBackdropClick={onClose} className="mx-auto max-w-(--k-app-max-w)">
      <div className="relative px-6 pb-10 pt-12 text-center">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
        {renderBody({
          token,
          info,
          loadError,
          ownedGoal,
          confirmState,
          confirmErrorMessage,
          authStatus,
          onConfirm: handleConfirm,
          onBypassGoalUpdated: handleBypassGoalUpdated,
          onBypassUnlocked: () => setConfirmState('confirmed'),
        })}
      </div>
    </Sheet>
  );
}

function renderBody({
  token,
  info,
  loadError,
  ownedGoal,
  confirmState,
  confirmErrorMessage,
  authStatus,
  onConfirm,
  onBypassGoalUpdated,
  onBypassUnlocked,
}: {
  token: string | null;
  info: VerificationInfo | null;
  loadError: boolean;
  ownedGoal: OwnedGoal;
  confirmState: ConfirmState;
  confirmErrorMessage: string | null;
  authStatus: CloudKitAuthState['status'];
  onConfirm: () => void;
  onBypassGoalUpdated: (goal: Goal) => void;
  onBypassUnlocked: () => void;
}) {
  if (!token) return null;

  if (loadError) {
    return (
      <>
        <h2 className="text-lg font-semibold">Link Not Found</h2>
        <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          This link may have expired or is no longer valid.
        </p>
      </>
    );
  }

  if (!info) return <Preloader />;

  if (info.is_verified || confirmState === 'confirmed') {
    return (
      <>
        <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
        <h2 className="mt-3 text-lg font-semibold">Confirmed!</h2>
        <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">{info.task_title}</p>
      </>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold">{info.task_title}</h2>
      {info.stake_amount_cents != null && <p className="mt-1 text-sm">{formatStakeCents(info.stake_amount_cents)} is on the line</p>}
      {info.deadline != null && (
        <p className="text-xs text-ios-secondary dark:text-ios-secondary-dark">Due {formatDeadline(new Date(info.deadline))}</p>
      )}
      <p className="mt-4 font-medium">Is it done?</p>

      {authStatus !== 'signed-in' ? (
        <p className="mt-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          Sign in with your Apple ID (above) to confirm.
        </p>
      ) : ownedGoal === undefined ? (
        <p className="mt-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">Checking…</p>
      ) : ownedGoal ? (
        <SelfConfirmBypass goal={ownedGoal} onGoalUpdated={onBypassGoalUpdated} onUnlocked={onBypassUnlocked} />
      ) : (
        <>
          {confirmErrorMessage && <p className="mt-2 text-sm text-red-500">{confirmErrorMessage}</p>}
          <Button large rounded onClick={onConfirm} disabled={confirmState === 'confirming'} className="mt-4">
            {confirmState === 'confirming' ? 'Confirming…' : 'Confirm'}
          </Button>
        </>
      )}
    </>
  );
}

/// Mirrors VerifyGoalView.selfConfirmBypassSection — only ever reachable for the goal's own
/// owner, who can't confirm their own goal, so watching enough ads is the alternative to
/// waiting on a friend. Writes only the owner's own CloudKit record; the server's
/// `task_verifications.is_verified` stays untouched, exactly as on iOS.
function SelfConfirmBypass({
  goal,
  onGoalUpdated,
  onUnlocked,
}: {
  goal: Goal;
  onGoalUpdated: (goal: Goal) => void;
  onUnlocked: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const { status: adStatus, watch } = useRewardedAd(AD_PLACEMENTS.verificationBypass, true);

  const remaining = Math.max(0, ADS_REQUIRED_FOR_VERIFICATION_BYPASS - goal.adsWatchedForVerificationBypass);

  async function watchAd() {
    setErrorMessage(null);
    setIsWatchingAd(true);
    const outcome = await watch();
    if (outcome === 'earned') {
      try {
        const updated = mapRecord(await recordAdWatchedForVerificationBypass(getCloudKitContainer(), goal));
        onGoalUpdated(updated);
        // recordAdWatchedForVerificationBypass flips isVerified itself at the threshold —
        // mirrors VerifyGoalView's `if task.isVerified { didConfirm = true }`.
        if (updated.isVerified) onUnlocked();
      } catch {
        setErrorMessage("Couldn't count that ad. Please try again.");
      }
    } else if (outcome === 'dismissed') {
      setErrorMessage("That ad didn't finish, so it doesn't count — try again.");
    } else {
      setErrorMessage('No ad is available right now — try again in a moment.');
    }
    setIsWatchingAd(false);
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">This is your own goal — a friend needs to confirm it.</p>
      <p className="text-sm text-ios-secondary dark:text-ios-secondary-dark">
        Or watch {remaining} more {remaining === 1 ? 'ad' : 'ads'} to unlock Done anyway
      </p>
      <button
        onClick={watchAd}
        disabled={isWatchingAd || adStatus === 'preloading'}
        className="mt-1 rounded-full border border-current px-4 py-1.5 text-sm font-medium text-primary disabled:opacity-40"
      >
        {isWatchingAd
          ? 'Watching…'
          : adStatus === 'ready'
            ? `Watch Ad · ${goal.adsWatchedForVerificationBypass}/${ADS_REQUIRED_FOR_VERIFICATION_BYPASS}`
            : adStatus === 'preloading'
              ? 'Loading…'
              : 'No Ad — Retry'}
      </button>
      {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}
