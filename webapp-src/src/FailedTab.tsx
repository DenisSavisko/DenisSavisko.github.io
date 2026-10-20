import { Link, ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { XCircleIcon } from './icons';
import { SwipeToDelete } from './SwipeToDelete';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';
import type { usePendingAction } from './usePendingAction';

type PendingAction = ReturnType<typeof usePendingAction>;

/// Mirrors FailedListView on iOS — grouped by deadline month, most recent first.
export function FailedTab({
  state,
  goals,
  onDelete,
  onRelease,
  pendingDeletions,
}: {
  state: GoalsState;
  goals: Goal[];
  onDelete: (goal: Goal) => void;
  onRelease: (goal: Goal) => void;
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
          <FailedRow key={goal.id} goal={goal} onDelete={onDelete} onRelease={onRelease} />
        )
      }
    />
  );
}

/// Mirrors FailedTaskRow, plus a Release button while a missed goal's hold is still held. It
/// opens ReleaseSheet: a hold can only be released by support, on request.
function FailedRow({
  goal,
  onDelete,
  onRelease,
}: {
  goal: Goal;
  onDelete: (goal: Goal) => void;
  onRelease: (goal: Goal) => void;
}) {
  const canRelease = goal.stakeStatus === 'held' && Boolean(goal.stripePaymentIntentId);
  return (
    <SwipeToDelete onDelete={() => onDelete(goal)}>
      <ListItem
        component="div"
        title={<span className="[overflow-wrap:anywhere]">{goal.title}</span>}
        text={`Due ${formatDeadline(goal.deadline)}`}
        after={
          <div className="flex flex-col items-end gap-1">
            <StakeBadge goal={goal} tab="failed" />
            {canRelease && (
              <Link onClick={() => onRelease(goal)} className="text-sm font-medium">
                Release
              </Link>
            )}
          </div>
        }
      />
    </SwipeToDelete>
  );
}

/// Pending-release count for the tab badge — mirrors ContentView.pendingFailedCount. Expects
/// the already-filtered "failed" list (sortedByTab), not all goals.
export function pendingFailedCount(failedGoals: Goal[]): number {
  return failedGoals.filter((g) => g.stakeStatus === 'held').length;
}
