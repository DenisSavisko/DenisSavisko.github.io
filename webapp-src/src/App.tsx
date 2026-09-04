import { useEffect, useMemo, useState } from 'react';
import { App as KonstaApp, Badge, Fab, Navbar, Page, Sheet, Tabbar, TabbarLink } from 'konsta/react';
import { useCloudKitAuth } from './useCloudKitAuth';
import { useGoals, sortedByTab } from './useGoals';
import { ActiveTab } from './ActiveTab';
import { DoneTab } from './DoneTab';
import { FailedTab, pendingFailedCount } from './FailedTab';
import { VerifyModal } from './VerifyModal';
import { AppleSignInButton } from './AppleSignInButton';
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

  useEffect(() => {
    const onHashChange = () => setToken(parseToken());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function closeVerifyModal() {
    setToken(null);
    if (window.location.hash.startsWith('#verify/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  const authState = useCloudKitAuth();
  const goalsState = useGoals(authState.status);

  // Mirrors TaskStore.activeTasks/doneTasks/failedTasks — recomputed whenever the underlying
  // goals list changes, not on every render (the "now" cutoff only needs to be roughly fresh).
  const { active, done, failed } = useMemo(
    () => (goalsState.status === 'loaded' ? sortedByTab(goalsState.goals, new Date()) : { active: [], done: [], failed: [] }),
    [goalsState]
  );
  const failedBadgeCount = pendingFailedCount(failed);

  return (
    <KonstaApp theme="ios" dark={false} safeAreas>
      <Page>
        <Navbar title={TAB_TITLES[tab]} />
        <AppleSignInButton />

        <div className="pb-28" hidden={tab !== 'active'}>
          <ActiveTab state={goalsState} goals={active} />
        </div>
        <div className="pb-28" hidden={tab !== 'done'}>
          <DoneTab state={goalsState} goals={done} />
        </div>
        <div className="pb-28" hidden={tab !== 'failed'}>
          <FailedTab state={goalsState} goals={failed} />
        </div>

        <Fab
          className="fixed bottom-24 right-4 z-10"
          icon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setIsAddSheetOpen(true)}
        />

        <Tabbar labels className="fixed inset-x-0 bottom-0">
          <TabbarLink
            active={tab === 'active'}
            onClick={() => setTab('active')}
            icon={<ChecklistIcon className="h-6 w-6" />}
            label="Goals"
          />
          <TabbarLink
            active={tab === 'done'}
            onClick={() => setTab('done')}
            icon={<CheckCircleIcon className="h-6 w-6" />}
            label="Done"
          />
          <TabbarLink
            active={tab === 'failed'}
            onClick={() => setTab('failed')}
            icon={
              <span className="relative inline-flex">
                <XCircleIcon className="h-6 w-6" />
                {failedBadgeCount > 0 && <Badge className="absolute -right-2 -top-1">{failedBadgeCount}</Badge>}
              </span>
            }
            label="Failed"
          />
        </Tabbar>
      </Page>

      <VerifyModal token={token} authStatus={authState.status} onClose={closeVerifyModal} />

      <Sheet opened={isAddSheetOpen} onBackdropClick={() => setIsAddSheetOpen(false)}>
        <div className="px-6 pb-10 pt-8 text-center">
          <h2 className="text-lg font-semibold">Coming Soon</h2>
          <p className="mt-2 text-sm text-ios-secondary dark:text-ios-secondary-dark">
            Creating and staking new goals from the web isn't built yet — for now, add goals in the iOS app and they'll show up
            here.
          </p>
        </div>
      </Sheet>
    </KonstaApp>
  );
}
