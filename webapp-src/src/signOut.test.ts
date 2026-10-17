import { describe, expect, it, vi } from 'vitest';
import { signOut, type SignOutDeps } from './signOut';

function makeDeps(calls: string[], overrides: Partial<SignOutDeps> = {}): SignOutDeps {
  return {
    signOutOfCloudKit: vi.fn(() => void calls.push('cloudkit')),
    syncSavedAuthToken: vi.fn(() => void calls.push('token')),
    signOutOfSupabase: vi.fn(async () => void calls.push('supabase')),
    reloadSignedOut: vi.fn(() => void calls.push('reload')),
    ...overrides,
  };
}

describe('signOut', () => {
  it('signs out of iCloud, clears the saved token, signs out of the backend, then reloads', async () => {
    const calls: string[] = [];
    await signOut(makeDeps(calls));
    expect(calls).toEqual(['cloudkit', 'token', 'supabase', 'reload']);
  });

  it('still finishes signing out when the backend sign-out fails', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { signOutOfSupabase: vi.fn(async () => Promise.reject(new Error('offline'))) });
    await signOut(deps);
    expect(calls).toEqual(['cloudkit', 'token', 'reload']);
  });
});
