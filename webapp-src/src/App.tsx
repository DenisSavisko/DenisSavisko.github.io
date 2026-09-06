import { useEffect, useMemo, useRef, useState } from 'react';
import { App as KonstaApp, Block, Fab, Navbar, Page } from 'konsta/react';
import { useCloudKitAuth } from './useCloudKitAuth';
import { useSystemDarkMode } from './useSystemDarkMode';
import { useGoals, sortedByTab, mapRecord, type Goal } from './useGoals';
import { deleteGoal, getCloudKitContainer, markGoalDone, recordAdWatchedForRelease, updateGoalStakeStatus } from './cloudkit';
import { ensureSignedIn } from './supabase';
import { releaseHold } from './staking';
import { ADS_REQUIRED_FOR_RELEASE } from './adsConfig';
import { ActiveTab } from './ActiveTab';
import { DoneTab } from './DoneTab';
import { FailedTab, pendingFailedCount } from './FailedTab';
import { VerifyModal } from './VerifyModal';
import { AppleSignInButton } from './AppleSignInButton';
import { AddGoalSheet } from './AddGoalSheet';
import { LinkCardPage } from './LinkCardPage';
import { ShareVerificationSheet, type ShareVerificationTarget } from './ShareVerificationSheet';
import { usePendingAction } from './usePendingAction';
import { useBackgroundSync } from './useBackgroundSync';
import { GlassTabbar } from './GlassTabbar';
import { ChecklistIcon, CheckCircleIcon, PlusIcon, XCircleIcon } from './icons';

type Tab = 'active' | 'done' | 'failed';

const TAB_TITLES: Record<Tab, string> = {
  active: 'My Main Goals',
  done: 'Done',
  failed: 'Failed',
};

function parseToken(): string | null {
  // Matches #verify/<token> — a hash fragment never reaches the server, so this page can
  // live at a fixed, static path (/webapp/) with no server-side routing at all.
  const match = /^#verify\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/// Matches #link-card/<token>, the one-time card-linking route (PAYMENTS_PLAN.md v2). Same
/// static-path trick as #verify above. Unlike every other route this one takes over the
/// whole page: the iOS app opens it in Safari with no session of its own, so there's nothing
/// to show around it — the token is the entire context.
function parseLinkCardToken(): string | null {
  const match = /^#link-card\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('active');
  const [token, setToken] = useState<string | null>(() => parseToken());
  const [linkCardToken, setLinkCardToken] = useState<string | null>(() => parseLinkCardToken());
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<(ShareVerificationTarget & { headline: string; message: string }) | null>(
    null
  );
  const pageRef = useRef<HTMLDivElement>(null);
  const isDark = useSystemDarkMode();

  useEffect(() => {
    const onHashChange = () => {
      setToken(parseToken());
      setLinkCardToken(parseLinkCardToken());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Tabs share one scrolling <Page> — without this, switching tabs while scrolled down (e.g.
  // on a long Failed list) leaves the newly-shown tab's content scrolled out of view, since
  // the scroll position belongs to the shared container, not to whichever tab is visible.
  useEffect(() => {
    pageRef.current?.scrollTo(0, 0);
  }, [tab]);

  function closeVerifyModal() {
    setToken(null);
    if (window.location.hash.startsWith('#verify/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  const authState = useCloudKitAuth();
  const [goalsState, reloadGoals, applyGoalOverride] = useGoals(authState.status);
  useBackgroundSync(goalsState, reloadGoals);

  // Mirrors TaskStore.activeTasks/doneTasks/failedTasks — recomputed whenever the underlying
  // goals list changes, not on every render (the "now" cutoff only needs to be roughly fresh).
  const { active, done, failed } = useMemo(
    () => (goalsState.status === 'loaded' ? sortedByTab(goalsState.goals, new Date()) : { active: [], done: [], failed: [] }),
    [goalsState]
  );
  const failedBadgeCount = pendingFailedCount(failed);

  // Mirrors ActiveListView/DoneListView/FailedListView each having their own PendingAction
  // instances — a shared pair works the same way here since goal ids are unique across tabs.
  const pendingCompletions = usePendingAction();
  const pendingDeletions = usePendingAction();

  /// Mirrors ActiveListView.toggleDone: gated goals go to the share prompt instead of
  /// completing (immediately, not delayed — there's nothing to undo yet), staked goals
  /// release their hold once the undo window passes and mark-done actually commits.
  function handleToggleDone(goal: Goal) {
    if (goal.requiresVerification && !goal.isVerified) {
      if (!goal.verificationCode) {
        window.alert("This goal is missing its verification link — can't re-share it.");
        return;
      }
      setShareTarget({
        title: goal.title,
        deadline: goal.deadline,
        stakeAmountCents: goal.stakeAmountCents,
        token: goal.verificationCode,
        headline: 'Share with your friend',
        message: "This goal needs a friend's confirmation before it can be marked done.",
      });
      return;
    }
    pendingCompletions.toggle(goal.id, async () => {
      try {
        const container = getCloudKitContainer();
        const updated = await markGoalDone(container, goal);
        // CloudKit's query index can lag several seconds behind a write that already
        // succeeded — without this, the goal would sit showing as still-active until a
        // reload happened to land after the index caught up (see useGoals.ts's
        // applyOverride).
        applyGoalOverride(goal.id, mapRecord(updated));
        if (goal.stripePaymentIntentId) {
          try {
            await ensureSignedIn();
            await releaseHold(goal.stripePaymentIntentId);
          } catch {
            // Left as "held" — useBackgroundSync retries this on the next refresh cycle,
            // mirroring StakeSync.retryPendingReleases on iOS.
          }
        }
        reloadGoals();
      } catch (error) {
        window.alert(`Couldn't mark this done: ${(error as Error).message}`);
      }
    });
  }

  /// Cancels the Stripe hold and writes back whatever status the backend reports — usually
  /// "released", but "captured" if the expiry cron won the race, which is a real outcome to
  /// show rather than an error (same as TaskStore.recordAdWatched/retryRelease on iOS).
  /// Throws on failure so the caller's UI can surface it; useBackgroundSync retries anything
  /// left stuck at "held" on its next pass either way.
  async function finishRelease(goal: Goal) {
    if (!goal.stripePaymentIntentId) return;
    await ensureSignedIn();
    const response = await releaseHold(goal.stripePaymentIntentId);
    const saved = await updateGoalStakeStatus(getCloudKitContainer(), goal, response.status);
    applyGoalOverride(goal.id, mapRecord(saved));
  }

  /// Mirrors TaskStore.recordAdWatched: banks one completed rewarded-ad watch toward
  /// releasing this goal's held stake, and once ADS_REQUIRED_FOR_RELEASE is reached, makes
  /// the same releaseHold + updateStakeStatus pair handleToggleDone's staked path makes.
  async function handleAdWatchedForRelease(goal: Goal) {
    if (goal.stakeStatus !== 'held') return;
    const updated = mapRecord(await recordAdWatchedForRelease(getCloudKitContainer(), goal));
    // Same CloudKit query-index lag as everywhere else — without this the counter would snap
    // back to its old value on the next poll (see useGoals.ts's applyOverride).
    applyGoalOverride(goal.id, updated);
    if (updated.adsWatchedForRelease >= ADS_REQUIRED_FOR_RELEASE) {
      await finishRelease(updated);
    }
    reloadGoals();
  }

  /// Mirrors TaskStore.retryRelease — the release call on its own, for a goal that already
  /// watched enough ads but whose release never confirmed (a dropped request, a closed tab).
  /// Deliberately doesn't touch adsWatchedForRelease: it's already at the required count, and
  /// bumping it further would misrepresent how many ads were actually needed.
  async function handleRetryRelease(goal: Goal) {
    if (goal.stakeStatus !== 'held') return;
    await finishRelease(goal);
    reloadGoals();
  }

  /// Mirrors ActiveListView/DoneListView/FailedListView's deleteTask + isDeletable gating —
  /// the undo window (pendingDeletions) is the confirmation, same as iOS, so no separate
  /// confirm dialog on top of it.
  function handleDelete(goal: Goal) {
    if (goal.stakeStatus === 'held') {
      window.alert("Staked goals can't be deleted while active. Complete it before the deadline, or wait to see if it fails.");
      return;
    }
    pendingDeletions.start(goal.id, async () => {
      try {
        await deleteGoal(getCloudKitContainer(), goal.recordName);
        // Same query-index lag as mark-done — without this the deleted goal would keep
        // showing up until a reload happened to land after the index caught up.
        applyGoalOverride(goal.id, null);
        reloadGoals();
      } catch (error) {
        window.alert(`Couldn't delete this goal: ${(error as Error).message}`);
      }
    });
  }

  const isSignedIn = authState.status === 'signed-in';

  // Card linking stands alone: no CloudKit sign-in, no tabs, no goals — the page is opened
  // straight from the iOS app (or from the stake gating below) purely to save a payment
  // method, and its token carries all the identity it needs.
  if (linkCardToken) {
    return (
      <KonstaApp theme="ios" dark={isDark} safeAreas className="mx-auto max-w-(--k-app-max-w)">
        <LinkCardPage token={linkCardToken} />
      </KonstaApp>
    );
  }

  return (
    <KonstaApp theme="ios" dark={isDark} safeAreas className="mx-auto max-w-(--k-app-max-w)">
      <Page ref={pageRef}>
        <Navbar title={isSignedIn ? TAB_TITLES[tab] : 'MyMainGoals'} />
        <AppleSignInButton />

        {!isSignedIn ? (
          // Nothing else is usable while signed out — no tabs, no creating goals, and (see
          // the VerifyModal below) no goal details either — there's only one thing to do
          // here, which is sign in with the one button above. The #verify/<token> hash is
          // left untouched the whole time it's up to VerifyModal's onClose to ever clear it,
          // never just because sign-in hasn't happened yet — so the moment sign-in completes,
          // the still-present token opens the confirm sheet automatically.
          <Block strong inset className="mt-10 text-center text-ios-secondary dark:text-ios-secondary-dark">
            {authState.status === 'loading'
              ? 'Loading…'
              : token
                ? 'Sign in with your Apple ID (above) to continue.'
                : 'Sign in with your Apple ID (above) to use MyMainGoals.'}
          </Block>
        ) : (
          <>
            {/* Only the active tab is ever mounted — as well as being simpler, this and the
                scroll-reset effect above are both needed to avoid the shared-scroll-position
                bug (see that effect's comment). */}
            {tab === 'active' && (
              <div className="pb-36">
                <ActiveTab
                  state={goalsState}
                  goals={active}
                  onToggleDone={handleToggleDone}
                  onDelete={handleDelete}
                  pendingCompletions={pendingCompletions}
                  pendingDeletions={pendingDeletions}
                />
              </div>
            )}
            {tab === 'done' && (
              <div className="pb-36">
                <DoneTab state={goalsState} goals={done} onDelete={handleDelete} pendingDeletions={pendingDeletions} />
              </div>
            )}
            {tab === 'failed' && (
              <div className="pb-36">
                <FailedTab
                  state={goalsState}
                  goals={failed}
                  onDelete={handleDelete}
                  onAdWatchedForRelease={handleAdWatchedForRelease}
                  onRetryRelease={handleRetryRelease}
                  pendingDeletions={pendingDeletions}
                />
              </div>
            )}

            {/* Fixed to the viewport (so it doesn't scroll away), but centered/capped to the
                same width as the app itself — otherwise it'd hug the real screen edge on a
                wide window instead of the edge of this phone-shaped column. A plain wrapper
                div, not a className override on Fab itself — it ships its own "relative"
                positioning internally, and fighting that with a conflicting position utility
                on the same element is what was making the old edge-to-edge Tabbar not render
                like Konsta's real native-style chrome (see GlassTabbar.tsx for why that's
                gone now too). */}
            <div className="pointer-events-none fixed inset-x-0 bottom-32 z-10 mx-auto flex max-w-(--k-app-max-w) justify-end pr-4">
              {/* Fab renders as an <a> by default, which has no native `disabled` — matches
                  ContentView's `.disabled(!store.canAddTask)` visually/interactively by hand
                  instead. Sized up from Konsta's default 44px (h-11/w-11) — !h-/!w- since
                  those are the same specificity as Fab's own base classes and cascade order
                  between the two isn't something to rely on. */}
              <Fab
                className={`pointer-events-auto !h-16 !w-16 ${active.length >= 3 ? 'opacity-40' : ''}`}
                aria-disabled={active.length >= 3}
                icon={<PlusIcon className="h-7 w-7" />}
                onClick={active.length >= 3 ? undefined : () => setIsAddSheetOpen(true)}
              />
            </div>

            <GlassTabbar
              items={[
                { id: 'active', label: 'Goals', active: tab === 'active', icon: <ChecklistIcon className="h-4 w-4" />, onClick: () => setTab('active') },
                { id: 'done', label: 'Done', active: tab === 'done', icon: <CheckCircleIcon className="h-4 w-4" />, onClick: () => setTab('done') },
                {
                  id: 'failed',
                  label: 'Failed',
                  active: tab === 'failed',
                  icon: <XCircleIcon className="h-4 w-4" />,
                  badge: failedBadgeCount,
                  onClick: () => setTab('failed'),
                },
              ]}
            />
          </>
        )}
      </Page>

      {/* Stays closed — showing nothing, not even the goal's title — until signed in, same as
          the rest of the app. Passing null (rather than some other "closed" signal) while
          signed out means it opens itself automatically the moment isSignedIn flips true, as
          long as the hash hasn't been cleared out from under it in the meantime. */}
      <VerifyModal
        token={isSignedIn ? token : null}
        authStatus={authState.status}
        onClose={closeVerifyModal}
        // The self-confirm ad bypass writes to a goal that's also sitting in the list behind
        // this sheet — same optimistic-update path as every other write, so the Goals tab
        // reflects it immediately instead of waiting on CloudKit's query index.
        onGoalUpdated={(goal) => {
          applyGoalOverride(goal.id, goal);
          reloadGoals();
        }}
      />

      <AddGoalSheet
        opened={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        onCreated={(goal) => {
          // Same query-index lag as mark-done/delete — without this the new goal wouldn't
          // show up until a reload happened to land after the index caught up.
          applyGoalOverride(goal.id, goal);
          reloadGoals();
          // Mirrors AddTaskSheet on iOS: a verification-gated goal goes straight from
          // creation into the share prompt, same as tapping done on one still unverified
          // (handleToggleDone) — just with wording for "you just made this" rather than
          // "you're trying to finish this."
          if (goal.requiresVerification && goal.verificationCode) {
            setShareTarget({
              title: goal.title,
              deadline: goal.deadline,
              stakeAmountCents: goal.stakeAmountCents,
              token: goal.verificationCode,
              headline: 'Share with your friend',
              message: `They'll need to open the link and confirm "${goal.title}" before it can be marked done.`,
            });
          }
        }}
      />

      <ShareVerificationSheet
        target={shareTarget}
        headline={shareTarget?.headline ?? ''}
        message={shareTarget?.message ?? ''}
        onClose={() => setShareTarget(null)}
      />
    </KonstaApp>
  );
}
