import { useEffect } from 'react';
import type { GoalsState } from './useGoals';
import { getCloudKitContainer, markGoalVerified, updateGoalStakeStatus } from './cloudkit';
import { ensureSignedIn } from './supabase';
import { getVerification } from './verification';
import { getStakeStatuses, releaseHold } from './staking';

/// Mirrors VerificationSync.syncPendingVerifications + StakeSync.retryPendingReleases +
/// StakeSync.syncHeldStatuses, all three called together on every iOS foreground — here,
/// run alongside useGoals's own refresh cycle (tab focus, the 20s poll) instead of a
/// scenePhase hook, since that's the closest web equivalent of "foreground."
///
/// Idempotent and cheap to over-run: each pass only ever makes network calls for goals that
/// actually need one (a pending verification, a stuck "held" stake), so re-running this every
/// ~20s costs nothing extra once everything's already resolved. Reloads once at the end if
/// anything actually changed, which re-runs this effect — the second pass finds nothing left
/// to do and stops there, same self-terminating shape as the retry-on-next-foreground pattern
/// it mirrors.
export function useBackgroundSync(goalsState: GoalsState, reload: () => void): void {
  useEffect(() => {
    if (goalsState.status !== 'loaded') return;
    let cancelled = false;

    (async () => {
      const container = getCloudKitContainer();
      let didChangeAnything = false;

      const needsSupabase =
        goalsState.goals.some((g) => g.requiresVerification && !g.isVerified && g.verificationCode) ||
        goalsState.goals.some((g) => g.stripePaymentIntentId && (g.stakeStatus === 'held' || g.stakeStatus == null));
      if (needsSupabase) {
        try {
          await ensureSignedIn();
        } catch {
          return; // Nothing below can succeed without a session — retried next cycle.
        }
      }

      // Mirrors VerificationSync.syncPendingVerifications — the confirming friend's browser
      // never talks to the goal owner's directly, so this poll is the only way a web-only
      // owner ever learns a confirmation happened.
      const pendingVerification = goalsState.goals.filter((g) => g.requiresVerification && !g.isVerified && g.verificationCode);
      for (const goal of pendingVerification) {
        if (cancelled) return;
        try {
          const info = await getVerification(goal.verificationCode!);
          if (info.is_verified) {
            await markGoalVerified(container, goal);
            didChangeAnything = true;
          }
        } catch {
          // Still pending (or a transient error) — retried next cycle either way.
        }
      }

      // Mirrors StakeSync.retryPendingReleases — a release-hold call that didn't confirm the
      // first time (e.g. no network at the moment mark-done ran). Web has no ads-release
      // flow, so unlike iOS this only ever matters for isDone, never adsWatchedForRelease.
      const pendingRelease = goalsState.goals.filter((g) => g.stakeStatus === 'held' && g.isDone && g.stripePaymentIntentId);
      for (const goal of pendingRelease) {
        if (cancelled) return;
        try {
          const response = await releaseHold(goal.stripePaymentIntentId!);
          await updateGoalStakeStatus(container, goal, response.status);
          didChangeAnything = true;
        } catch {
          // Still pending — retried next cycle.
        }
      }

      // Mirrors StakeSync.syncHeldStatuses — picks up server-side status changes with no
      // client call at all (the expiry cron capturing a stake past deadline+grace). Excludes
      // goals just handled above to avoid double-processing them in the same pass.
      const justHandled = new Set(pendingRelease.map((g) => g.id));
      const unresolvedStaked = goalsState.goals.filter(
        (g) => g.stripePaymentIntentId && (g.stakeStatus === 'held' || g.stakeStatus == null) && !justHandled.has(g.id)
      );
      if (unresolvedStaked.length > 0) {
        try {
          const statusByPaymentIntentId = await getStakeStatuses(unresolvedStaked.map((g) => g.stripePaymentIntentId!));
          for (const goal of unresolvedStaked) {
            if (cancelled) return;
            const newStatus = statusByPaymentIntentId.get(goal.stripePaymentIntentId!);
            if (newStatus && newStatus !== goal.stakeStatus) {
              await updateGoalStakeStatus(container, goal, newStatus);
              didChangeAnything = true;
            } else if (!newStatus && goal.stakeStatus == null) {
              // No row for this payment intent at all — create-hold inserts the row and the
              // Stripe PaymentIntent atomically, so a missing row proves the stake was never
              // actually created and couldn't have been captured. "released" is the correct
              // terminal state, not a guess (see StakeSync.syncHeldStatuses's own comment).
              await updateGoalStakeStatus(container, goal, 'released');
              didChangeAnything = true;
            }
          }
        } catch {
          // Best-effort — retried next cycle.
        }
      }

      if (didChangeAnything && !cancelled) reload();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsState, reload]);
}
