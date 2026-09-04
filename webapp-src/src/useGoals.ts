import { useCallback, useEffect, useState } from 'react';
import { CORE_DATA_ZONE_ID, GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';
import { getCloudKitContainer } from './cloudkit';
import type { CloudKitAuthState } from './useCloudKitAuth';

export type GoalStatus = 'active' | 'done' | 'failed';

export interface Goal {
  id: string;
  /// Needed to write back to this exact record (markGoalDone/deleteGoal) — recordName is
  /// CloudKit's own identity for the record, unrelated to `id` (see cloudkitConfig.ts).
  recordName: string;
  recordChangeTag: string;
  title: string;
  deadline: Date;
  isDone: boolean;
  completedDate: Date | null;
  stakeAmountCents: number | null;
  stripePaymentIntentId: string | null;
  stakeStatus: string | null;
  requiresVerification: boolean;
  verificationCode: string | null;
  isVerified: boolean;
}

export type GoalsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; goals: Goal[] };

function fieldValue(record: CKRecord, key: string): unknown {
  return record.fields[key]?.value;
}

function mapRecord(record: CKRecord): Goal {
  const deadline = fieldValue(record, GOAL_FIELDS.deadline);
  const completedDate = fieldValue(record, GOAL_FIELDS.completedDate);
  return {
    id: String(fieldValue(record, GOAL_FIELDS.id) ?? record.recordName),
    recordName: record.recordName,
    recordChangeTag: record.recordChangeTag ?? '',
    title: String(fieldValue(record, GOAL_FIELDS.title) ?? ''),
    deadline: new Date(deadline as string | number),
    isDone: Boolean(fieldValue(record, GOAL_FIELDS.isDone)),
    completedDate: completedDate != null ? new Date(completedDate as string | number) : null,
    stakeAmountCents: (fieldValue(record, GOAL_FIELDS.stakeAmountCents) as number | null) ?? null,
    stripePaymentIntentId: (fieldValue(record, GOAL_FIELDS.stripePaymentIntentId) as string | null) ?? null,
    stakeStatus: (fieldValue(record, GOAL_FIELDS.stakeStatus) as string | null) ?? null,
    requiresVerification: Boolean(fieldValue(record, GOAL_FIELDS.requiresVerification)),
    verificationCode: (fieldValue(record, GOAL_FIELDS.verificationCode) as string | null) || null,
    isVerified: Boolean(fieldValue(record, GOAL_FIELDS.isVerified)),
  };
}

export function useGoals(authStatus: CloudKitAuthState['status']): [GoalsState, () => void] {
  const [state, setState] = useState<GoalsState>({ status: 'idle' });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authStatus !== 'signed-in') {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    // Stale-while-revalidate: only show the loading placeholder on the very first load. A
    // background refresh (focus refetch, the 20s poll) keeps last-known-good data on screen
    // — replacing the whole list with a loading spinner every 20s made the list feel broken,
    // and CloudKit JS is a real network round trip each time (unlike iOS's fetchTasks(), a
    // synchronous local read with nothing to show a spinner for in the first place).
    setState((prev) => (prev.status === 'loaded' ? prev : { status: 'loading' }));
    (async () => {
      try {
        const container = getCloudKitContainer();
        const response = await container.privateCloudDatabase.performQuery(
          { recordType: GOAL_RECORD_TYPE },
          { zoneID: CORE_DATA_ZONE_ID }
        );
        if (response.hasErrors) {
          throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
        }
        if (!cancelled) setState({ status: 'loaded', goals: response.records.map(mapRecord) });
      } catch (error) {
        // A failed background refresh keeps showing the last-known-good list rather than
        // replacing it with an error screen — only a first-load failure does that.
        if (!cancelled) {
          setState((prev) => (prev.status === 'loaded' ? prev : { status: 'error', message: (error as Error).message }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, reloadToken]);

  // CloudKit JS has no subscription/push channel for browsers (that's iOS/macOS-only), so
  // there's no way to be told a goal changed elsewhere (the iOS app, another tab) — refetch
  // on tab focus catches the common "switched away and back" case cheaply.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [authStatus, reload]);

  // Polling fallback for changes made elsewhere while this tab stays focused and visible the
  // whole time (so focus/visibilitychange never fires) — same 15-30s range as iOS's refresh
  // timer, same underlying gap (no push channel) on both platforms.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    const interval = setInterval(reload, 20_000);
    return () => clearInterval(interval);
  }, [authStatus, reload]);

  return [state, reload];
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
