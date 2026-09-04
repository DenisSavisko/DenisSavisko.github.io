import { useEffect, useState } from 'react';
import { GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';
import { getCloudKitContainer } from './cloudkit';
import type { CloudKitAuthState } from './useCloudKitAuth';

export type GoalStatus = 'active' | 'done' | 'failed';

export interface Goal {
  id: string;
  title: string;
  deadline: Date;
  isDone: boolean;
  completedDate: Date | null;
  stakeAmountCents: number | null;
  stakeStatus: string | null;
  requiresVerification: boolean;
  isVerified: boolean;
}

export type GoalsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; goals: Goal[] };

function fieldValue(record: { fields: Record<string, { value: unknown }> }, key: string): unknown {
  return record.fields[key]?.value;
}

function mapRecord(record: { recordName: string; fields: Record<string, { value: unknown }> }): Goal {
  const deadline = fieldValue(record, GOAL_FIELDS.deadline);
  const completedDate = fieldValue(record, GOAL_FIELDS.completedDate);
  return {
    id: record.recordName,
    title: String(fieldValue(record, GOAL_FIELDS.title) ?? ''),
    deadline: new Date(deadline as string | number),
    isDone: Boolean(fieldValue(record, GOAL_FIELDS.isDone)),
    completedDate: completedDate != null ? new Date(completedDate as string | number) : null,
    stakeAmountCents: (fieldValue(record, GOAL_FIELDS.stakeAmountCents) as number | null) ?? null,
    stakeStatus: (fieldValue(record, GOAL_FIELDS.stakeStatus) as string | null) ?? null,
    requiresVerification: Boolean(fieldValue(record, GOAL_FIELDS.requiresVerification)),
    isVerified: Boolean(fieldValue(record, GOAL_FIELDS.isVerified)),
  };
}

/// Loads once per sign-in — reloading after a change (e.g. a future "mark done" write) isn't
/// implemented yet, since this tab is currently read-only, same scope as the rest of this
/// proof of concept.
export function useGoals(authStatus: CloudKitAuthState['status']): GoalsState {
  const [state, setState] = useState<GoalsState>({ status: 'idle' });

  useEffect(() => {
    if (authStatus !== 'signed-in') {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const container = getCloudKitContainer();
        const response = await container.privateCloudDatabase.performQuery({ recordType: GOAL_RECORD_TYPE });
        if (response.hasErrors) {
          throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
        }
        if (!cancelled) setState({ status: 'loaded', goals: response.records.map(mapRecord) });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: (error as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  return state;
}

/// Mirrors GoalTask.status(asOf:) in MyMainGoals/GoalTask.swift.
export function statusOf(goal: Goal, referenceDate: Date): GoalStatus {
  if (goal.isDone) return 'done';
  if (goal.deadline < referenceDate) return 'failed';
  return 'active';
}

/// Mirrors TaskStore.activeTasks/doneTasks/failedTasks sort orders exactly.
export function sortedByTab(goals: Goal[], now: Date) {
  const active = goals
    .filter((g) => statusOf(g, now) === 'active')
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const done = goals
    .filter((g) => statusOf(g, now) === 'done')
    .sort((a, b) => (b.completedDate ?? b.deadline).getTime() - (a.completedDate ?? a.deadline).getTime());
  const failed = goals
    .filter((g) => statusOf(g, now) === 'failed')
    .sort((a, b) => b.deadline.getTime() - a.deadline.getTime());
  return { active, done, failed };
}

/// Mirrors CurrencyFormatting.string(cents:) — whole dollars, no decimals.
export function formatStakeCents(cents: number): string {
  return `$${Math.floor(cents / 100)}`;
}

export function formatDeadline(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const monthYearFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/// Mirrors DoneListView/FailedListView's groupedSections — grouped by month, most recent
/// group first, using each list's already-sorted order for both group order and row order.
export function groupByMonth(goals: Goal[], dateOf: (g: Goal) => Date): Array<{ title: string; goals: Goal[] }> {
  const groups: Array<{ title: string; goals: Goal[] }> = [];
  for (const goal of goals) {
    const title = monthYearFormatter.format(dateOf(goal));
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.title === title) {
      lastGroup.goals.push(goal);
    } else {
      groups.push({ title, goals: [goal] });
    }
  }
  return groups;
}
