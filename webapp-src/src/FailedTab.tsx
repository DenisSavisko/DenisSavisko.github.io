import { useState } from 'react';
import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { XCircleIcon, TrashIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';
import { ADS_REQUIRED_FOR_RELEASE, AD_PLACEMENTS } from './adsConfig';
import { useRewardedAd } from './useRewardedAd';
import type { usePendingAction } from './usePendingAction';

type PendingAction = ReturnType<typeof usePendingAction>;

/// Mirrors FailedListView on iOS — grouped by deadline month, most recent first, with the
/// watch-ads-to-release flow on any goal still `held` (see FailedRow).
export function FailedTab({
  state,
  goals,
  onDelete,
  onAdWatchedForRelease,
  onRetryRelease,
  pendingDeletions,
}: {
  state: GoalsState;
  goals: Goal[];
  onDelete: (goal: Goal) => void;
  onAdWatchedForRelease: (goal: Goal) => Promise<void>;
  onRetryRelease: (goal: Goal) => Promise<void>;
  pendingDeletions: PendingAction;
}) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<XCircleIcon />}
      emptyTitle="No Failed Goals"
      emptyText="Goals you miss the deadline on will show up here."
      groupDateOf={(goal) => goal.deadline}
      renderRow={(goal) =>
        pendingDeletions.isPending(goal.id) ? (
          <PendingDeleteRow
            key={goal.id}
            title={goal.title}
            startedAt={pendingDeletions.startedAt(goal.id)!}
            delayMs={pendingDeletions.delayMs}
            onUndo={() => pendingDeletions.cancel(goal.id)}
          />
        ) : (
          <FailedRow
            key={goal.id}
            goal={goal}
            onDelete={onDelete}
            onAdWatchedForRelease={onAdWatchedForRelease}
            onRetryRelease={onRetryRelease}
          />
        )
      }
    />
  );
}

/// Mirrors FailedTaskRow, including its two mutually exclusive sections below the row: the
/// ad-watching offer while a held stake still needs ads, and the release-pending state once
/// enough were watched but the release call hasn't confirmed.
function FailedRow({
  goal,
  onDelete,
  onAdWatchedForRelease,
  onRetryRelease,
}: {
  goal: Goal;
  onDelete: (goal: Goal) => void;
  onAdWatchedForRelease: (goal: Goal) => Promise<void>;
  onRetryRelease: (goal: Goal) => Promise<void>;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [isRetryingRelease, setIsRetryingRelease] = useState(false);

  const isHeld = goal.stakeStatus === 'held';
  /// True once enough ads were watched but the release still hasn't confirmed (e.g. the tab
  /// closed mid-request) — offering another "Watch Ad" here would be confusing, since more
  /// ads isn't what's actually needed.
  const hasWatchedEnoughAds = goal.adsWatchedForRelease >= ADS_REQUIRED_FOR_RELEASE;
  const adsRemaining = Math.max(0, ADS_REQUIRED_FOR_RELEASE - goal.adsWatchedForRelease);

  // Mirrors FailedTaskRow's `.task { guard task.stakeStatus == "held", !hasWatchedEnoughAds }`
  // preload — a row with nothing to offer never loads the ad script at all.
  const { status: adStatus, watch } = useRewardedAd(AD_PLACEMENTS.release, isHeld && !hasWatchedEnoughAds);

  async function watchAd() {
    setErrorMessage(null);
    setIsWatchingAd(true);
    const outcome = await watch();
    if (outcome === 'earned') {
      try {
        await onAdWatchedForRelease(goal);
      } catch {
        setErrorMessage("Couldn't release the charge yet. Please try again.");
      }
    } else if (outcome === 'dismissed') {
      setErrorMessage("That ad didn't finish, so it doesn't count — try again.");
    } else {
      setErrorMessage('No ad is available right now — try again in a moment.');
    }
    setIsWatchingAd(false);
  }

  async function retryRelease() {
    setErrorMessage(null);
    setIsRetryingRelease(true);
    try {
      await onRetryRelease(goal);
    } catch {
      setErrorMessage("Still couldn't confirm the release — it'll keep retrying automatically.");
    }
    setIsRetryingRelease(false);
  }

  return (
    <ListItem
      title={goal.title}
      subtitle={`Due ${formatDeadline(goal.deadline)}`}
      footer={
        isHeld ? (
          <div className="mt-1 flex flex-col gap-1">
            {hasWatchedEnoughAds ? (
              <>
                <p>
                  You've watched enough ads — finishing the release. This also retries automatically in the background.
                </p>
                <AdButton onClick={retryRelease} disabled={isRetryingRelease}>
                  {isRetryingRelease ? 'Retrying…' : 'Retry Now'}
                </AdButton>
              </>
            ) : (
              <>
                <p>
                  Watch {adsRemaining} more {adsRemaining === 1 ? 'ad' : 'ads'} to avoid the charge
                </p>
                <AdButton onClick={watchAd} disabled={isWatchingAd || adStatus === 'preloading'}>
                  {isWatchingAd
                    ? 'Watching…'
                    : adStatus === 'ready'
                      ? `Watch Ad · ${goal.adsWatchedForRelease}/${ADS_REQUIRED_FOR_RELEASE}`
                      : adStatus === 'preloading'
                        ? 'Loading…'
                        : 'No Ad — Retry'}
                </AdButton>
              </>
            )}
            {errorMessage && <p className="text-red-500">{errorMessage}</p>}
          </div>
        ) : undefined
      }
      after={
        <div className="flex items-center gap-2">
          <StakeBadge goal={goal} tab="failed" />
          <button aria-label="Delete goal" onClick={() => onDelete(goal)} className="text-ios-secondary dark:text-ios-secondary-dark">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      }
    />
  );
}

/// A plain bordered button rather than Konsta's <Button>, matching iOS's `.bordered`
/// `.controlSize(.small)` treatment — Konsta's own Button is full-width and sized for a
/// primary action, which is much too heavy for a row's footer.
function AdButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="self-start rounded-full border border-current px-3 py-1 text-xs font-medium text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/// Pending-release count for the tab badge — mirrors ContentView.pendingFailedCount. Expects
/// the already-filtered "failed" list (sortedByTab), not all goals.
export function pendingFailedCount(failedGoals: Goal[]): number {
  return failedGoals.filter((g) => g.stakeStatus === 'held').length;
}
