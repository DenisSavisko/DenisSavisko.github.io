import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { XCircleIcon, TrashIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';
import type { usePendingAction } from './usePendingAction';

type PendingAction = ReturnType<typeof usePendingAction>;

/// Mirrors FailedListView on iOS — grouped by deadline month, most recent first. No
/// ad-watching-to-release flow here (that's AdMob, iOS-only) — this is read/delete only.
export function FailedTab({
  state,
  goals,
  onDelete,
  pendingDeletions,
}: {
  state: GoalsState;
  goals: Goal[];
  onDelete: (goal: Goal) => void;
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
          <FailedRow key={goal.id} goal={goal} onDelete={onDelete} />
        )
      }
    />
  );
}

function FailedRow({ goal, onDelete }: { goal: Goal; onDelete: (goal: Goal) => void }) {
  return (
    <ListItem
      title={goal.title}
      subtitle={`Due ${formatDeadline(goal.deadline)}`}
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

/// Pending-release count for the tab badge — mirrors ContentView.pendingFailedCount. Expects
/// the already-filtered "failed" list (sortedByTab), not all goals.
export function pendingFailedCount(failedGoals: Goal[]): number {
  return failedGoals.filter((g) => g.stakeStatus === 'held').length;
}
