import { describe, expect, it } from 'vitest';
import { goalsPendingRelease } from './useBackgroundSync';
import { makeGoal } from './testGoal';

describe('goalsPendingRelease', () => {
  it('retries only done goals whose hold is still held', () => {
    const stuck = makeGoal({ isDone: true, stakeStatus: 'held', stripePaymentIntentId: 'pi_1' });
    const notDone = makeGoal({ stakeStatus: 'held', stripePaymentIntentId: 'pi_2' });
    const released = makeGoal({ isDone: true, stakeStatus: 'released', stripePaymentIntentId: 'pi_3' });
    const unstaked = makeGoal({ isDone: true });

    expect(goalsPendingRelease([stuck, notDone, released, unstaked])).toEqual([stuck]);
  });
});
