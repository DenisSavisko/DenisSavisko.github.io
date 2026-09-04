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
