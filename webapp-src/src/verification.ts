import { supabase } from './supabase';

export interface VerificationInfo {
  task_title: string;
  stake_amount_cents: number | null;
  deadline: string | null;
  is_verified: boolean;
}

export type ConfirmResult = 'confirmed' | 'already_confirmed' | 'not_found';

/// Mirrors VerificationClient.create on iOS — mints the token before the goal exists, same
/// order AddTaskSheet uses (server-side token first, then the local/CloudKit record).
export async function createVerification(title: string, stakeAmountCents: number | null, deadline: Date): Promise<string> {
  const { data, error } = await supabase.rpc('create_verification', {
    p_title: title,
    p_stake_cents: stakeAmountCents,
    p_deadline: deadline.toISOString(),
  });
  if (error) throw error;
  return data as string;
}

export async function getVerification(token: string): Promise<VerificationInfo> {
  const { data, error } = await supabase.rpc('get_verification', { p_token: token });
  if (error) throw error;
  const info = (data as VerificationInfo[])[0];
  if (!info) throw new Error('not_found');
  return info;
}

/// Only ever call this from an explicit button tap — never on page load. Chat apps
/// (Messages, WhatsApp, Slack) auto-fetch links to build previews and would silently confirm
/// on the friend's behalf before they ever see the page. Mirrors VerificationClient.confirm.
export async function confirmVerification(token: string): Promise<ConfirmResult> {
  const { data, error } = await supabase.rpc('confirm_verification', { p_token: token });
  if (error) throw error;
  return data as ConfirmResult;
}
