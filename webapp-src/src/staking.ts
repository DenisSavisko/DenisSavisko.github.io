import { supabase } from './supabase';

export interface ReleaseHoldResponse {
  paymentIntentId: string;
  status: string;
}

export interface CreateHoldResponse {
  goalId: string;
  paymentIntentId: string;
  /// `requires_capture` once the hold is in place; `requires_action` when the card's bank
  /// wants 3D Secure, which `clientSecret` lets the browser complete.
  status: string;
  clientSecret: string | null;
}

/// The create-hold failures that get their own message instead of a generic one.
export type StakingErrorCode = 'card_declined' | 'too_many_holds';

export class StakingError extends Error {
  constructor(public readonly code: StakingErrorCode) {
    super(code);
    this.name = 'StakingError';
  }
}

/// supabase-js reports a non-2xx edge function response as a FunctionsHttpError whose
/// `context` is the raw Response — the JSON body (and so the error code) is only reachable
/// by reading it back off that.
async function stakingErrorCode(error: unknown): Promise<StakingErrorCode | null> {
  const response = (error as { context?: Response }).context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.json();
    const code = body?.error;
    return code === 'card_declined' || code === 'too_many_holds' ? code : null;
  } catch {
    return null;
  }
}

/// Places the hold for one staked goal with the card the user just approved for it (Apple
/// Pay or the card form). Nothing is saved; see create-hold's own comment.
export async function createHold(paymentMethodId: string, stakeAmountCents: number, deadline: Date): Promise<CreateHoldResponse> {
  const { data, error } = await supabase.functions.invoke('create-hold', {
    body: { paymentMethodId, stakeAmountCents, deadline: deadline.toISOString() },
  });
  if (error) {
    const code = await stakingErrorCode(error);
    if (code) throw new StakingError(code);
    throw error;
  }
  return data as CreateHoldResponse;
}

/// Mirrors StakingClient.releaseHold on iOS — cancels the Stripe hold, never charges. Same
/// trust model as confirm_verification: requires *some* signed-in Supabase session, but
/// ownership isn't checked beyond knowing the paymentIntentId (see the edge function's own
/// comment) — that's an existing, already-shipped tradeoff, not something introduced here.
export async function releaseHold(paymentIntentId: string): Promise<ReleaseHoldResponse> {
  const { data, error } = await supabase.functions.invoke('release-hold', {
    body: { paymentIntentId },
  });
  if (error) throw error;
  return data as ReleaseHoldResponse;
}

interface StakedGoalStatusRow {
  stripe_payment_intent_id: string;
  status: string;
}

/// Mirrors StakeSync.syncHeldStatuses's RPC call — picks up server-side status changes that
/// happen with no client call at all (the expiry cron capturing a stake once deadline+grace
/// passes). SECURITY DEFINER, identity-independent (see that iOS comment for why), so no
/// ownership check beyond knowing the payment intent id, same trust level as release-hold.
export async function getStakeStatuses(paymentIntentIds: string[]): Promise<Map<string, string>> {
  if (paymentIntentIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_stake_statuses', { p_payment_intent_ids: paymentIntentIds });
  if (error) throw error;
  const rows = data as StakedGoalStatusRow[];
  return new Map(rows.map((row) => [row.stripe_payment_intent_id, row.status]));
}
