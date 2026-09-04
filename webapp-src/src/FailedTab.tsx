import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { XCircleIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';

/// Mirrors FailedListView on iOS — grouped by deadline month, most recent first. No
/// ad-watching-to-release flow here (that's AdMob, iOS-only) — this is read-only status.
export function FailedTab({ state, goals }: { state: GoalsState; goals: Goal[] }) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<XCircleIcon />}
      emptyTitle="No Failed Goals"
      emptyText="Goals you miss the deadline on will show up here."
      groupDateOf={(goal) => goal.deadline}
      renderRow={(goal) => <FailedRow key={goal.id} goal={goal} />}
    />
  );
}

function FailedRow({ goal }: { goal: Goal }) {
  return (
    <ListItem title={goal.title} subtitle={`Due ${formatDeadline(goal.deadline)}`} after={<StakeBadge goal={goal} tab="failed" />} />
  );
}

/// Pending-release count for the tab badge — mirrors ContentView.pendingFailedCount. Expects
/// the already-filtered "failed" list (sortedByTab), not all goals.
export function pendingFailedCount(failedGoals: Goal[]): number {
  return failedGoals.filter((g) => g.stakeStatus === 'held').length;
}
