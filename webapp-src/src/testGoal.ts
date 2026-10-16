import type { Goal } from './useGoals';

/// A plain active goal due in an hour; tests override only what they care about.
export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: crypto.randomUUID(),
    recordName: crypto.randomUUID(),
    recordChangeTag: 'tag',
    title: 'Goal',
    deadline: new Date(Date.now() + 3_600_000),
    isDone: false,
    completedDate: null,
    stakeAmountCents: null,
    stripePaymentIntentId: null,
    stakeStatus: null,
    requiresVerification: false,
    verificationCode: null,
    isVerified: false,
    ...overrides,
  };
}
