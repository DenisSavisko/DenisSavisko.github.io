import { Badge } from 'konsta/react';
import type { Goal, GoalStatus } from './useGoals';
import { formatStakeCents } from './useGoals';

const TINTS = {
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
  green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  mint: { bg: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-700 dark:text-emerald-200' },
  red: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200' },
} as const;

/// Mirrors ActiveTaskRow/DoneTaskRow/FailedTaskRow's stakeBadge switches on iOS — same text,
/// same tint semantics, per tab.
function content(goal: Goal, tab: GoalStatus): { text: string; tint: keyof typeof TINTS } | null {
  if (goal.stakeAmountCents == null) return null;
  const amount = formatStakeCents(goal.stakeAmountCents);

  if (tab === 'active') {
    return { text: `${amount} at risk`, tint: 'yellow' };
  }

  if (tab === 'done') {
    switch (goal.stakeStatus) {
      case 'released':
        return { text: `${amount} saved`, tint: 'green' };
      case 'captured':
        return { text: `${amount} charged (missed the release window)`, tint: 'red' };
      default:
        return { text: `Releasing ${amount}…`, tint: 'gray' };
    }
  }

  // tab === 'failed'
  switch (goal.stakeStatus) {
    case 'captured':
      return { text: `${amount} charged`, tint: 'red' };
    case 'expired':
      return { text: `${amount} hold expired (not charged)`, tint: 'gray' };
    case 'released':
      return { text: `${amount} saved`, tint: 'mint' };
    case 'held':
      return { text: `${amount} pending`, tint: 'orange' };
    default:
      return null;
  }
}

export function StakeBadge({ goal, tab }: { goal: Goal; tab: GoalStatus }) {
  const badge = content(goal, tab);
  if (!badge) return null;
  const tint = TINTS[badge.tint];
  return (
    <Badge small colors={{ bg: tint.bg, text: tint.text }} className="whitespace-normal text-right">
      {badge.text}
    </Badge>
  );
}
