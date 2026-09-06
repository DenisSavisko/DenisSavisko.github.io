import { useCallback, useEffect, useMemo, useState } from 'react';
import { CORE_DATA_ZONE_ID, GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';
import { ensureZoneExists, getCloudKitContainer } from './cloudkit';
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
  /// The two ad counters (see adsConfig.ts). Separate on purpose, exactly as on iOS: they
  /// gate different things (a held stake past its deadline vs. a still-gated goal's own
  /// owner unlocking Done), so progress toward one never counts toward the other.
  adsWatchedForRelease: number;
  adsWatchedForVerificationBypass: number;
}

export type GoalsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; goals: Goal[] };

function fieldValue(record: CKRecord, key: string): unknown {
  return record.fields[key]?.value;
}

/// Turns a raw CloudKit record (from a query, or a write's own response) into a Goal —
/// exported so write helpers' callers (App.tsx, AddGoalSheet.tsx) can build one from
/// createGoal/markGoalDone/etc.'s returned record for an optimistic update (see
/// GoalsState/applyOverride below), without waiting on a re-fetch to see their own write.
export function mapRecord(record: CKRecord): Goal {
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
    // Absent on any record written before these fields existed — GoalTask's own Swift
    // defaults are 0 too, so a missing field means "none watched", never unknown.
    adsWatchedForRelease: Number(fieldValue(record, GOAL_FIELDS.adsWatchedForRelease) ?? 0),
    adsWatchedForVerificationBypass: Number(fieldValue(record, GOAL_FIELDS.adsWatchedForVerificationBypass) ?? 0),
  };
}

/// goal: the known-correct Goal to show for this id (a create or update), or null to mean
/// "treat this id as deleted." Expires after a while so a write we somehow got wrong doesn't
/// override the server's view of the world forever — just long enough to bridge CloudKit's
/// query-index lag (see applyOverride's own comment).
interface Override {
  goal: Goal | null;
  expiresAt: number;
}
const OVERRIDE_TTL_MS = 20_000;

export function useGoals(authStatus: CloudKitAuthState['status']): [GoalsState, () => void, (id: string, goal: Goal | null) => void] {
  const [state, setState] = useState<GoalsState>({ status: 'idle' });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  /// Call right after a successful write (create/update/delete) with the Goal it actually
  /// produced — CloudKit's query index can lag several seconds behind a write that already
  /// succeeded, so `performQuery` (what every reload/poll here runs) can keep returning the
  /// *old* state for a goal for a little while after mark-done, delete, or create. Without
  /// this, that lag reads as "my change didn't work" until a reload happens to land after the
  /// index catches up. This makes the affected goal authoritative locally until it expires or
  /// a later fetch confirms the server agrees, whichever comes first.
  const applyOverride = useCallback((id: string, goal: Goal | null) => {
    setOverrides((prev) => ({ ...prev, [id]: { goal, expiresAt: Date.now() + OVERRIDE_TTL_MS } }));
  }, []);

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
        // A first-time web-only user (never installed iOS, so SwiftData's automatic CloudKit
        // mirroring never created this zone in their own private database) hit this as
        // "Couldn't load goals: Zone does not exist" — see ensureZoneExists's own comment.
        await ensureZoneExists(container);
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

  // Applies any still-live overrides over whatever the last fetch returned — an override
  // whose goal is non-null replaces (or, for a just-created goal the fetch doesn't know about
  // yet, adds) that entry; null removes it (a just-deleted goal the fetch hasn't caught up to
  // dropping yet). An expired override is just ignored, not actively cleaned up — harmless
  // clutter in a small object for as long as this hook stays mounted.
  const mergedState = useMemo((): GoalsState => {
    if (state.status !== 'loaded') return state;
    const now = Date.now();
    const live = Object.entries(overrides).filter(([, o]) => o.expiresAt > now);
    if (live.length === 0) return state;
    const liveMap = new Map(live);
    const seen = new Set<string>();
    const merged: Goal[] = [];
    for (const goal of state.goals) {
      seen.add(goal.id);
      const override = liveMap.get(goal.id);
      if (override === undefined) merged.push(goal);
      else if (override.goal) merged.push(override.goal);
      // else: overridden as deleted — omitted
    }
    for (const [id, override] of liveMap) {
      if (!seen.has(id) && override.goal) merged.push(override.goal);
    }
    return { status: 'loaded', goals: merged };
  }, [state, overrides]);

  return [mergedState, reload, applyOverride];
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
