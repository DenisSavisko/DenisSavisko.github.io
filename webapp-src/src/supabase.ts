import { createClient } from '@supabase/supabase-js';

// Same project/publishable key as MyMainGoals/Supabase/SupabaseConfig.swift — this key is
// meant to be public (RLS + RPC grants do the real gating), same trust level as embedding it
// in the iOS app bundle.
export const supabase = createClient(
  'https://uvituvxcjqcrdahecusr.supabase.co',
  'sb_publishable_fIzUvzpgzINwEtHrACL85w_So9HXoe2'
);

/// confirm_verification/get_verification require *some* signed-in session, not a specific
/// identity — mirrors SupabaseManager.ensureSignedIn() on iOS. Cheap no-op once signed in.
export async function ensureSignedIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}
