import { useEffect, useMemo, useRef, useState } from 'react';
import { App as KonstaApp, Block, Fab, Navbar, Page } from 'konsta/react';
import { useCloudKitAuth } from './useCloudKitAuth';
import { useGoals, sortedByTab, type Goal } from './useGoals';
import { deleteGoal, getCloudKitContainer, markGoalDone } from './cloudkit';
import { ensureSignedIn } from './supabase';
import { releaseHold } from './staking';
import { ActiveTab } from './ActiveTab';
import { DoneTab } from './DoneTab';
import { FailedTab, pendingFailedCount } from './FailedTab';
import { VerifyModal } from './VerifyModal';
import { AppleSignInButton } from './AppleSignInButton';
import { AddGoalSheet } from './AddGoalSheet';
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

export default function App() {
  const [tab, setTab] = useState<Tab>('active');
  const [token, setToken] = useState<string | null>(() => parseToken());
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<(ShareVerificationTarget & { headline: string; message: string }) | null>(
    null
  );
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHashChange = () => setToken(parseToken());
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
  const [goalsState, reloadGoals] = useGoals(authState.status);
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
        await markGoalDone(container, goal);
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
        reloadGoals();
      } catch (error) {
        window.alert(`Couldn't delete this goal: ${(error as Error).message}`);
      }
    });
  }

  const isSignedIn = authState.status === 'signed-in';

  // rounded-[48px]/overflow-hidden on KonstaApp itself (not Page) so the clip applies to the
  // whole phone-shaped column, top and bottom corners both — Page fills it via absolute
  // inset-0 and doesn't itself grow this box, so both corners stay on screen together at all
  // times, not just whichever end you've scrolled to. 48px is a rough scale-up of iPhone's
  // actual screen corner radius (~44-55px on real devices) for our wider 480px column.
  return (
    <KonstaApp theme="ios" dark={false} safeAreas className="mx-auto max-w-(--k-app-max-w) overflow-hidden rounded-[48px] shadow-2xl">
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
                <FailedTab state={goalsState} goals={failed} onDelete={handleDelete} pendingDeletions={pendingDeletions} />
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
                  instead. */}
              <Fab
                className={`pointer-events-auto${active.length >= 3 ? ' opacity-40' : ''}`}
                aria-disabled={active.length >= 3}
                icon={<PlusIcon className="h-5 w-5" />}
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
      <VerifyModal token={isSignedIn ? token : null} authStatus={authState.status} onClose={closeVerifyModal} />

      <AddGoalSheet opened={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} onCreated={reloadGoals} />

      <ShareVerificationSheet
        target={shareTarget}
        headline={shareTarget?.headline ?? ''}
        message={shareTarget?.message ?? ''}
        onClose={() => setShareTarget(null)}
      />
    </KonstaApp>
  );
}
