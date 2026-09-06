import { useEffect, useState } from 'react';
import { getCloudKitContainer, isCloudKitConfigured } from './cloudkit';
import { saveAuthTokenCookie } from './cloudkitAuthPersistence';

export type CloudKitAuthState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in' };

/// Calls setUpAuth() exactly once for the whole app (it injects into #apple-sign-in-button as
/// a side effect and isn't meant to be called repeatedly) — call this once at the top level
/// (App.tsx) and pass the result down, rather than from every component that cares about
/// sign-in state.
export function useCloudKitAuth(): CloudKitAuthState {
  const [state, setState] = useState<CloudKitAuthState>(
    isCloudKitConfigured() ? { status: 'loading' } : { status: 'unconfigured' }
  );

  useEffect(() => {
    if (!isCloudKitConfigured()) return;
    let cancelled = false;
    const container = getCloudKitContainer();

    // Mirrored to localStorage on every auth transition, since the cookie CloudKit JS writes
    // gets capped to 24h by Safari — see cloudkitAuthPersistence.ts. Saving runs regardless of
    // `cancelled`: the token is app-wide state, not this hook's render state, and a sign-in
    // that lands after unmount is still one worth persisting.
    container.whenUserSignsIn().then(() => {
      saveAuthTokenCookie();
      if (!cancelled) setState({ status: 'signed-in' });
    });
    container.whenUserSignsOut().then(() => {
      // Clears the mirror — a stale token here would be restored on the next visit and
      // silently undo the sign-out.
      saveAuthTokenCookie();
      if (!cancelled) setState({ status: 'signed-out' });
    });
    container.setUpAuth().then((userIdentity) => {
      saveAuthTokenCookie();
      if (!cancelled) setState({ status: userIdentity ? 'signed-in' : 'signed-out' });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
