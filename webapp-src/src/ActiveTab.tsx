import { ListItem } from 'konsta/react';
import { GoalListPage } from './GoalListPage';
import { PendingDeleteRow } from './PendingDeleteRow';
import { ChecklistIcon, CheckCircleIcon, CircleIcon, TrashIcon } from './icons';
import { formatDeadline } from './useGoals';
import type { Goal, GoalsState } from './useGoals';
import { StakeBadge } from './StakeBadge';
import type { usePendingAction } from './usePendingAction';

type PendingAction = ReturnType<typeof usePendingAction>;

/// Mirrors ActiveListView on iOS — a flat list (no month grouping), sorted by nearest
/// deadline first. No swipe gestures on web (Konsta has no swipeout support) — delete is a
/// visible trash icon instead, same isDeletable/needsVerification gating and undo-delay as iOS.
export function ActiveTab({
  state,
  goals,
  onToggleDone,
  onDelete,
  pendingCompletions,
  pendingDeletions,
}: {
  state: GoalsState;
  goals: Goal[];
  onToggleDone: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  pendingCompletions: PendingAction;
  pendingDeletions: PendingAction;
}) {
  return (
    <GoalListPage
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      goals={goals}
      emptyIcon={<ChecklistIcon />}
      emptyTitle="No Goals Yet"
      emptyText="Add up to 3 goals to focus on."
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
          <ActiveRow key={goal.id} goal={goal} onToggleDone={onToggleDone} onDelete={onDelete} pendingCompletions={pendingCompletions} />
        )
      }
    />
  );
}

function ActiveRow({
  goal,
  onToggleDone,
  onDelete,
  pendingCompletions,
}: {
  goal: Goal;
  onToggleDone: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  pendingCompletions: PendingAction;
}) {
  const isPending = pendingCompletions.isPending(goal.id);

  return (
    <ListItem
      media={
        <button
          aria-label="Mark done"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(goal);
          }}
          className={isPending ? 'text-green-500' : 'text-ios-secondary dark:text-ios-secondary-dark'}
        >
          {isPending ? <CheckCircleIcon className="h-6 w-6" /> : <CircleIcon className="h-6 w-6" />}
        </button>
      }
      title={<span className={isPending ? 'line-through text-ios-secondary dark:text-ios-secondary-dark' : undefined}>{goal.title}</span>}
      subtitle={`Due ${formatDeadline(goal.deadline)}`}
      footer={
        isPending ? (
          <div
            key={pendingCompletions.startedAt(goal.id)}
            className="pending-countdown-bar mt-1 h-1 w-full rounded-full bg-green-500/60"
            style={{ '--pending-delay': `${pendingCompletions.delayMs}ms` } as React.CSSProperties}
          />
        ) : goal.requiresVerification && !goal.isVerified ? (
          <span className="text-blue-500 dark:text-blue-400">Awaiting a friend's confirmation</span>
        ) : undefined
      }
      after={
        <div className="flex items-center gap-2 opacity-100" style={isPending ? { opacity: 0.5 } : undefined}>
          <StakeBadge goal={goal} tab="active" />
          <button aria-label="Delete goal" onClick={() => onDelete(goal)} className="text-ios-secondary dark:text-ios-secondary-dark">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      }
    />
  );
}
