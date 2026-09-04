import { useEffect, useState } from 'react';
import { Button, Preloader, Sheet } from 'konsta/react';
import { ensureSignedIn } from './supabase';
import { confirmVerification, getVerification, type VerificationInfo } from './verification';
import { getCloudKitContainer, ownsGoalWithVerificationCode } from './cloudkit';
import type { CloudKitAuthState } from './useCloudKitAuth';
import { formatDeadline, formatStakeCents } from './useGoals';
import { CheckCircleIcon, XMarkIcon } from './icons';

type ConfirmState = 'idle' | 'confirming' | 'confirmed' | 'error';

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
}: {
  token: string | null;
  authStatus: CloudKitAuthState['status'];
  onClose: () => void;
}) {
  const [info, setInfo] = useState<VerificationInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ownsGoal, setOwnsGoal] = useState<boolean | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [confirmErrorMessage, setConfirmErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setInfo(null);
    setLoadError(false);
    setOwnsGoal(null);
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
        const owns = await ownsGoalWithVerificationCode(getCloudKitContainer(), token);
        if (!cancelled) setOwnsGoal(owns);
      } catch {
        // Fail open to the Confirm button rather than blocking a real friend just because the
        // self-check couldn't run.
        if (!cancelled) setOwnsGoal(false);
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

  return (
    <Sheet opened={token != null} onBackdropClick={onClose}>
      <div className="relative px-6 pb-10 pt-12 text-center">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
        {renderBody({ token, info, loadError, ownsGoal, confirmState, confirmErrorMessage, authStatus, onConfirm: handleConfirm })}
      </div>
    </Sheet>
  );
}

function renderBody({
  token,
  info,
  loadError,
  ownsGoal,
  confirmState,
  confirmErrorMessage,
  authStatus,
  onConfirm,
}: {
  token: string | null;
  info: VerificationInfo | null;
  loadError: boolean;
  ownsGoal: boolean | null;
  confirmState: ConfirmState;
  confirmErrorMessage: string | null;
  authStatus: CloudKitAuthState['status'];
  onConfirm: () => void;
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
      ) : ownsGoal === null ? (
        <p className="mt-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">Checking…</p>
      ) : ownsGoal ? (
        <p className="mt-4 text-sm text-ios-secondary dark:text-ios-secondary-dark">
          This is your own goal — a friend needs to confirm it.
        </p>
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
