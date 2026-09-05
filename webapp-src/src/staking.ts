import { supabase } from './supabase';

export interface ReleaseHoldResponse {
  paymentIntentId: string;
  status: string;
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
