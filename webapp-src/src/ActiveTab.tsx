import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { ChecklistIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';

/// Mirrors ActiveListView on iOS — a flat list (no month grouping), sorted by nearest
/// deadline first. Read-only: no toggle-done or swipe-to-delete, since those write to
/// CloudKit and are out of scope for this proof of concept (see webapp-src/README.md).
export function ActiveTab({ state, goals }: { state: GoalsState; goals: Goal[] }) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<ChecklistIcon />}
      emptyTitle="No Goals Yet"
      emptyText="Goals you add in the app will show up here."
      renderRow={(goal) => <ActiveRow key={goal.id} goal={goal} />}
    />
  );
}

function ActiveRow({ goal }: { goal: Goal }) {
  return (
    <ListItem
      title={goal.title}
      subtitle={`Due ${formatDeadline(goal.deadline)}`}
      footer={
        goal.requiresVerification && !goal.isVerified ? (
          <span className="text-blue-500 dark:text-blue-400">Awaiting a friend's confirmation</span>
        ) : undefined
      }
      after={<StakeBadge goal={goal} tab="active" />}
    />
  );
}
