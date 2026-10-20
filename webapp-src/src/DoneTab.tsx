import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { CheckCircleIcon } from './icons';
import { SwipeToDelete } from './SwipeToDelete';
import { formatDeadline } from './useGoals';
import { Secondary } from './Secondary';
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
    <SwipeToDelete onDelete={() => onDelete(goal)}>
      <ListItem
        component="div"
        title={<span className="[overflow-wrap:anywhere]">{goal.title}</span>}
        subtitle={goal.completedDate ? <Secondary>Completed {formatDeadline(goal.completedDate)}</Secondary> : undefined}
        after={<StakeBadge goal={goal} tab="done" />}
      />
    </SwipeToDelete>
  );
}
