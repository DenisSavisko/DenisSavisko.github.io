import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { CheckCircleIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';

/// Mirrors DoneListView on iOS — grouped by completion month, most recent first.
export function DoneTab({ state, goals }: { state: GoalsState; goals: Goal[] }) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<CheckCircleIcon />}
      emptyTitle="No Completed Goals"
      emptyText="Goals you finish will show up here."
      groupDateOf={(goal) => goal.completedDate ?? goal.deadline}
      renderRow={(goal) => <DoneRow key={goal.id} goal={goal} />}
    />
  );
}

function DoneRow({ goal }: { goal: Goal }) {
  return (
    <ListItem
      title={goal.title}
      subtitle={goal.completedDate ? `Completed ${formatDeadline(goal.completedDate)}` : undefined}
      after={<StakeBadge goal={goal} tab="done" />}
    />
  );
}
