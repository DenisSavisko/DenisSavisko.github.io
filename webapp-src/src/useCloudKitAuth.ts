import { useEffect, useState } from 'react';
import { getCloudKitContainer, isCloudKitConfigured } from './cloudkit';

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

    container.whenUserSignsIn().then(() => {
      if (!cancelled) setState({ status: 'signed-in' });
    });
    container.whenUserSignsOut().then(() => {
      if (!cancelled) setState({ status: 'signed-out' });
    });
    container.setUpAuth().then((userIdentity) => {
      if (!cancelled) setState({ status: userIdentity ? 'signed-in' : 'signed-out' });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
