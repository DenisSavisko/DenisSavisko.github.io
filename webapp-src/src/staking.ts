import { supabase } from './supabase';

export interface ReleaseHoldResponse {
  paymentIntentId: string;
  status: string;
}

export interface CreateHoldResponse {
  goalId: string;
  paymentIntentId: string;
  status: string;
}

/// The create-hold failures the app can act on, mirroring StakingError in
/// MyMainGoals/Backend/StakingClient.swift. All three end at the same place — the user has
/// to (re)link a card — but they need different copy.
export type StakingErrorCode = 'card_not_linked' | 'card_authentication_required' | 'card_declined';

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
    return code === 'card_not_linked' || code === 'card_authentication_required' || code === 'card_declined' ? code : null;
  } catch {
    return null;
  }
}

/// Mirrors StakingClient.createHold on iOS (PAYMENTS_PLAN.md v2): no payment token, no
/// payment UI. The hold is placed server-side, off-session, against the card the user linked
/// once via #link-card — so unlike v1 there's no client-side 3D Secure step left to run, and
/// a card that needs the cardholder present comes back as card_authentication_required
/// instead.
export async function createHold(stakeAmountCents: number, deadline: Date): Promise<CreateHoldResponse> {
  const { data, error } = await supabase.functions.invoke('create-hold', {
    body: { stakeAmountCents, deadline: deadline.toISOString() },
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
