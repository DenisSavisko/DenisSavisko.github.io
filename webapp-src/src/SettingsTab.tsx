import { useState } from 'react';
import { BlockFooter, List, ListItem } from 'konsta/react';
import { getCloudKitContainer } from './cloudkit';
import { saveAuthTokenCookie } from './cloudkitAuthPersistence';
import { supabase } from './supabase';
import { signOut } from './signOut';

/// Opens the iPhone app when it's installed, otherwise the App Store. It has to be a separate
/// host (the mymaingoals-open repo): Safari keeps taps on mymaingoals.app itself in the
/// browser, so only a link to another domain can hand off to the app.
const IPHONE_APP_URL = 'https://open.mymaingoals.app/';

/// Mirrors the iOS app's Settings tab, with what the web needs instead: a way to sign out
/// (the web has no other), and a link to the iPhone app.
export function SettingsTab() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (!window.confirm('Sign out of MyMainGoals on this browser?')) return;
    setIsSigningOut(true);
    await signOut({
      signOutOfCloudKit: () => getCloudKitContainer().signOut(),
      syncSavedAuthToken: saveAuthTokenCookie,
      signOutOfSupabase: () => supabase.auth.signOut({ scope: 'local' }),
      reloadSignedOut: () => window.location.replace(window.location.pathname),
    });
  }

  return (
    <>
      <List strong inset>
        <ListItem link href={IPHONE_APP_URL} title="Get the iPhone App" />
      </List>
      <List strong inset>
        <ListItem
          link
          chevron={false}
          title={<span className="text-red-500">{isSigningOut ? 'Signing Out…' : 'Sign Out'}</span>}
          onClick={isSigningOut ? undefined : handleSignOut}
        />
      </List>
      <BlockFooter>Your goals stay in your iCloud and come back when you sign in again.</BlockFooter>
    </>
  );
}
