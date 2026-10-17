import { describe, expect, it, vi } from 'vitest';
import { createStakedGoal, type StakedGoalDeps } from './stakedGoal';
import { makeGoal } from './testGoal';

const deadline = new Date('2026-10-17T12:00:00Z');

function makeDeps(overrides: Partial<StakedGoalDeps> = {}): StakedGoalDeps {
  return {
    createHold: vi.fn(async () => ({ goalId: 'row', paymentIntentId: 'pi_1', status: 'requires_capture', clientSecret: 'secret' })),
    confirmCardPayment: vi.fn(async () => ({ status: 'requires_capture', errorMessage: null })),
    releaseHold: vi.fn(async () => ({})),
    createGoal: vi.fn(async (stake) => makeGoal({ stakeAmountCents: stake.amountCents, stripePaymentIntentId: stake.paymentIntentId })),
    ...overrides,
  };
}

describe('createStakedGoal', () => {
  it('creates the goal once the hold is in place', async () => {
    const deps = makeDeps();
    const goal = await createStakedGoal(deps, 'pm_1', 2000, deadline);

    expect(deps.createHold).toHaveBeenCalledWith('pm_1', 2000, deadline);
    expect(deps.confirmCardPayment).not.toHaveBeenCalled();
    expect(deps.createGoal).toHaveBeenCalledWith({ amountCents: 2000, paymentIntentId: 'pi_1' });
    expect(deps.releaseHold).not.toHaveBeenCalled();
    expect(goal.stripePaymentIntentId).toBe('pi_1');
  });

  it('runs 3D Secure when the bank asks, then creates the goal', async () => {
    const deps = makeDeps({
      createHold: vi.fn(async () => ({ goalId: 'row', paymentIntentId: 'pi_1', status: 'requires_action', clientSecret: 'secret' })),
    });
    await createStakedGoal(deps, 'pm_1', 2000, deadline);

    expect(deps.confirmCardPayment).toHaveBeenCalledWith('secret');
    expect(deps.createGoal).toHaveBeenCalled();
    expect(deps.releaseHold).not.toHaveBeenCalled();
  });

  it('cancels the hold and creates no goal when 3D Secure fails', async () => {
    const deps = makeDeps({
      createHold: vi.fn(async () => ({ goalId: 'row', paymentIntentId: 'pi_1', status: 'requires_action', clientSecret: 'secret' })),
      confirmCardPayment: vi.fn(async () => ({ status: null, errorMessage: 'Authentication failed.' })),
    });

    await expect(createStakedGoal(deps, 'pm_1', 2000, deadline)).rejects.toThrow('Authentication failed.');
    expect(deps.createGoal).not.toHaveBeenCalled();
    expect(deps.releaseHold).toHaveBeenCalledWith('pi_1');
  });

  it('cancels the hold when saving the goal fails', async () => {
    const deps = makeDeps({ createGoal: vi.fn(async () => Promise.reject(new Error('CloudKit down'))) });

    await expect(createStakedGoal(deps, 'pm_1', 2000, deadline)).rejects.toThrow('CloudKit down');
    expect(deps.releaseHold).toHaveBeenCalledWith('pi_1');
  });

  it('creates nothing and releases nothing when the hold is refused', async () => {
    const deps = makeDeps({ createHold: vi.fn(async () => Promise.reject(new Error('declined'))) });

    await expect(createStakedGoal(deps, 'pm_1', 2000, deadline)).rejects.toThrow('declined');
    expect(deps.createGoal).not.toHaveBeenCalled();
    expect(deps.releaseHold).not.toHaveBeenCalled();
  });

  it('treats any other hold status as a failure and cancels it', async () => {
    const deps = makeDeps({
      createHold: vi.fn(async () => ({ goalId: 'row', paymentIntentId: 'pi_1', status: 'requires_payment_method', clientSecret: 'secret' })),
    });

    await expect(createStakedGoal(deps, 'pm_1', 2000, deadline)).rejects.toThrow();
    expect(deps.createGoal).not.toHaveBeenCalled();
    expect(deps.releaseHold).toHaveBeenCalledWith('pi_1');
  });

  it('still reports the original error if cancelling the hold also fails', async () => {
    const deps = makeDeps({
      createGoal: vi.fn(async () => Promise.reject(new Error('CloudKit down'))),
      releaseHold: vi.fn(async () => Promise.reject(new Error('network'))),
    });

    await expect(createStakedGoal(deps, 'pm_1', 2000, deadline)).rejects.toThrow('CloudKit down');
  });
});
