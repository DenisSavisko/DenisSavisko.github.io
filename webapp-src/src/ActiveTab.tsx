import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { ChecklistIcon, CircleIcon, TrashIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';

/// Mirrors ActiveListView on iOS — a flat list (no month grouping), sorted by nearest
/// deadline first. No swipe gestures on web (Konsta has no swipeout support) — delete is a
/// visible trash icon instead, same isDeletable/needsVerification gating as iOS either way.
export function ActiveTab({
  state,
  goals,
  onToggleDone,
  onDelete,
}: {
  state: GoalsState;
  goals: Goal[];
  onToggleDone: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<ChecklistIcon />}
      emptyTitle="No Goals Yet"
      emptyText={`Add up to 3 goals to focus on.`}
      renderRow={(goal) => <ActiveRow key={goal.id} goal={goal} onToggleDone={onToggleDone} onDelete={onDelete} />}
    />
  );
}

function ActiveRow({
  goal,
  onToggleDone,
  onDelete,
}: {
  goal: Goal;
  onToggleDone: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  return (
    <ListItem
      media={
        <button
          aria-label="Mark done"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(goal);
          }}
          className="text-ios-secondary dark:text-ios-secondary-dark"
        >
          <CircleIcon className="h-6 w-6" />
        </button>
      }
      title={goal.title}
      subtitle={`Due ${formatDeadline(goal.deadline)}`}
      footer={
        goal.requiresVerification && !goal.isVerified ? (
          <span className="text-blue-500 dark:text-blue-400">Awaiting a friend's confirmation</span>
        ) : undefined
      }
      after={
        <div className="flex items-center gap-2">
          <StakeBadge goal={goal} tab="active" />
          <button aria-label="Delete goal" onClick={() => onDelete(goal)} className="text-ios-secondary dark:text-ios-secondary-dark">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      }
    />
  );
}
