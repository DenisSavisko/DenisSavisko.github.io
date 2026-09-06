import { supabase } from './supabase';

export interface LinkedCard {
  brand: string | null;
  last4: string | null;
}

/// Mirrors LinkedCard.displayName in MyMainGoals/Backend/PaymentMethodClient.swift.
export function formatCard(card: LinkedCard): string {
  const brand = (card.brand ?? 'card').replace(/^./, (c) => c.toUpperCase());
  return card.last4 ? `${brand} •••• ${card.last4}` : brand;
}

/// Mirrors PaymentMethodClient.linkedCard on iOS. Returns null when there's no card on file
/// — including the case where a Stripe customer exists but linking was never finished, which
/// is a row with a null payment_method_id.
export async function getLinkedCard(): Promise<LinkedCard | null> {
  const { data, error } = await supabase
    .from('user_payment_methods')
    .select('stripe_payment_method_id, card_brand, card_last4')
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row || !row.stripe_payment_method_id) return null;
  return { brand: row.card_brand, last4: row.card_last4 };
}

/// Mints the short-lived token that authorizes the #link-card page to attach a payment
/// method to the caller. The web app is already signed in, so it could in principle skip the
/// token — but running the same token flow the iOS app uses keeps one code path on the page
/// itself, and the token is a single authenticated call away.
export async function createLinkCardSession(): Promise<{ token: string; url: string }> {
  const { data, error } = await supabase.functions.invoke('create-link-card-session', { body: {} });
  if (error) throw error;
  return data as { token: string; url: string };
}

/// Called by the #link-card page on load. Creates a **zero-charge** SetupIntent — nothing is
/// billed when a card is linked; stakes are charged later, off-session, only on a missed
/// deadline.
export async function createSetupIntent(token: string): Promise<{ clientSecret: string; currentCard: LinkedCard | null }> {
  const { data, error } = await supabase.functions.invoke('create-setup-intent', { body: { token } });
  if (error) throw error;
  return data as { clientSecret: string; currentCard: LinkedCard | null };
}

/// Called after Stripe.js reports the SetupIntent confirmed. The server re-reads it from
/// Stripe rather than trusting this call's word for it — see the edge function's comment.
export async function confirmCardLink(token: string, setupIntentId: string): Promise<LinkedCard> {
  const { data, error } = await supabase.functions.invoke('confirm-card-link', {
    body: { token, setupIntentId },
  });
  if (error) throw error;
  return (data as { card: LinkedCard }).card;
}
