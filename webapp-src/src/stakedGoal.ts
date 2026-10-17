import type { CreateHoldResponse } from './staking';
import type { Goal } from './useGoals';

/// Everything createStakedGoal talks to, passed in so the flow can be tested without Stripe,
/// Supabase, or CloudKit.
export interface StakedGoalDeps {
  createHold: (paymentMethodId: string, stakeAmountCents: number, deadline: Date) => Promise<CreateHoldResponse>;
  /// Runs the bank's 3D Secure step (Stripe's confirmCardPayment) and reports where the
  /// PaymentIntent ended up.
  confirmCardPayment: (clientSecret: string) => Promise<{ status: string | null; errorMessage: string | null }>;
  releaseHold: (paymentIntentId: string) => Promise<unknown>;
  createGoal: (stake: { amountCents: number; paymentIntentId: string }) => Promise<Goal>;
}

/// Places the hold, finishes 3D Secure if the bank asks for it, then writes the goal. The goal
/// only ever exists once its hold is in place, and a hold never outlives a goal that failed
/// to be created: any failure after the hold is placed cancels it, so no money stays
/// reserved for a goal the user never got.
export async function createStakedGoal(
  deps: StakedGoalDeps,
  paymentMethodId: string,
  stakeAmountCents: number,
  deadline: Date
): Promise<Goal> {
  const hold = await deps.createHold(paymentMethodId, stakeAmountCents, deadline);
  try {
    if (hold.status === 'requires_action') {
      if (!hold.clientSecret) throw new Error('Payment could not be confirmed.');
      const result = await deps.confirmCardPayment(hold.clientSecret);
      if (result.errorMessage) throw new Error(result.errorMessage);
      if (result.status !== 'requires_capture') throw new Error('Payment could not be confirmed.');
    } else if (hold.status !== 'requires_capture') {
      throw new Error('Payment could not be confirmed.');
    }
    return await deps.createGoal({ amountCents: stakeAmountCents, paymentIntentId: hold.paymentIntentId });
  } catch (error) {
    await deps.releaseHold(hold.paymentIntentId).catch(() => {});
    throw error;
  }
}
