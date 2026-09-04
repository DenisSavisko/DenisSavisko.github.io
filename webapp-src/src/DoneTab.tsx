import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { CheckCircleIcon, TrashIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';
import type { usePendingAction } from './usePendingAction';

type PendingAction = ReturnType<typeof usePendingAction>;

/// Mirrors DoneListView on iOS — grouped by completion month, most recent first.
export function DoneTab({
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
      emptyIcon={<CheckCircleIcon />}
      emptyTitle="No Completed Goals"
      emptyText="Goals you finish will show up here."
      groupDateOf={(goal) => goal.completedDate ?? goal.deadline}
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
          <DoneRow key={goal.id} goal={goal} onDelete={onDelete} />
        )
      }
    />
  );
}

function DoneRow({ goal, onDelete }: { goal: Goal; onDelete: (goal: Goal) => void }) {
  return (
    <ListItem
      title={goal.title}
      subtitle={goal.completedDate ? `Completed ${formatDeadline(goal.completedDate)}` : undefined}
      after={
        <div className="flex items-center gap-2">
          <StakeBadge goal={goal} tab="done" />
          <button aria-label="Delete goal" onClick={() => onDelete(goal)} className="text-ios-secondary dark:text-ios-secondary-dark">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      }
    />
  );
}
