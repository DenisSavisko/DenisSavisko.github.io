import { describe, expect, it } from 'vitest';
import { GOAL_FIELDS } from './cloudkitConfig';
import { groupByMonth, mapRecord, sortedByTab, statusOf } from './useGoals';
import { makeGoal } from './testGoal';

const now = new Date('2026-10-16T12:00:00Z');
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe('statusOf', () => {
  it('is active before the deadline', () => {
    expect(statusOf(makeGoal({ deadline: hours(1) }), now)).toBe('active');
  });

  it('is failed once the deadline passes without being done', () => {
    expect(statusOf(makeGoal({ deadline: hours(-1) }), now)).toBe('failed');
  });

  it('stays done even when finished after the deadline', () => {
    expect(statusOf(makeGoal({ deadline: hours(-1), isDone: true }), now)).toBe('done');
  });
});

describe('sortedByTab', () => {
  it('splits goals by status in the same orders as iOS', () => {
    const soon = makeGoal({ title: 'soon', deadline: hours(1) });
    const later = makeGoal({ title: 'later', deadline: hours(5) });
    const doneOld = makeGoal({ title: 'doneOld', isDone: true, completedDate: hours(-5) });
    const doneNew = makeGoal({ title: 'doneNew', isDone: true, completedDate: hours(-1) });
    const failedOld = makeGoal({ title: 'failedOld', deadline: hours(-5) });
    const failedNew = makeGoal({ title: 'failedNew', deadline: hours(-1) });

    const { active, done, failed } = sortedByTab([later, failedOld, doneOld, soon, failedNew, doneNew], now);

    expect(active.map((g) => g.title)).toEqual(['soon', 'later']);
    expect(done.map((g) => g.title)).toEqual(['doneNew', 'doneOld']);
    expect(failed.map((g) => g.title)).toEqual(['failedNew', 'failedOld']);
  });
});

describe('groupByMonth', () => {
  it('keeps consecutive goals from the same month together', () => {
    const goals = [
      makeGoal({ deadline: new Date('2026-10-20T12:00:00Z') }),
      makeGoal({ deadline: new Date('2026-10-02T12:00:00Z') }),
      makeGoal({ deadline: new Date('2026-09-15T12:00:00Z') }),
    ];
    const groups = groupByMonth(goals, (g) => g.deadline);
    expect(groups.map((g) => g.goals.length)).toEqual([2, 1]);
  });
});

describe('mapRecord', () => {
  const record = (fields: Record<string, unknown>) =>
    ({
      recordName: 'record-1',
      recordChangeTag: 'tag-1',
      fields: Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value }])),
    }) as unknown as CKRecord;

  it('reads the fields the iOS app writes', () => {
    const goal = mapRecord(
      record({
        [GOAL_FIELDS.id]: 'goal-1',
        [GOAL_FIELDS.title]: 'Ship it',
        [GOAL_FIELDS.deadline]: hours(2).getTime(),
        [GOAL_FIELDS.isDone]: 1,
        [GOAL_FIELDS.completedDate]: hours(1).getTime(),
        [GOAL_FIELDS.requiresVerification]: 1,
        [GOAL_FIELDS.verificationCode]: 'token',
        [GOAL_FIELDS.isVerified]: 0,
      })
    );
    expect(goal).toMatchObject({
      id: 'goal-1',
      recordName: 'record-1',
      recordChangeTag: 'tag-1',
      title: 'Ship it',
      isDone: true,
      requiresVerification: true,
      verificationCode: 'token',
      isVerified: false,
    });
    expect(goal.deadline.getTime()).toBe(hours(2).getTime());
    expect(goal.completedDate?.getTime()).toBe(hours(1).getTime());
  });

  it('falls back sensibly when optional fields are missing', () => {
    const goal = mapRecord(record({ [GOAL_FIELDS.title]: 'Bare', [GOAL_FIELDS.deadline]: hours(1).getTime() }));
    expect(goal.id).toBe('record-1');
    expect(goal.isDone).toBe(false);
    expect(goal.completedDate).toBeNull();
    expect(goal.verificationCode).toBeNull();
    expect(goal.stakeStatus).toBeNull();
  });
});
