import { useState } from 'react';
import { BlockFooter, List, ListItem } from 'konsta/react';
import { getCloudKitContainer } from './cloudkit';
import { saveAuthTokenCookie } from './cloudkitAuthPersistence';
import { supabase } from './supabase';
import { signOut } from './signOut';

const APP_STORE_URL = 'https://apps.apple.com/app/id6806742917';

/// Mirrors the iOS app's Settings tab, with what the web needs instead: a way to sign out
/// (the web has no other), and a link to the iPhone app. An App Store link rather than an
/// "open the app" link: a web page can't reliably open an app, and on an iPhone that already
/// has it the App Store page shows Open anyway.
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
        <ListItem link href={APP_STORE_URL} target="_blank" title="Get the iPhone App" />
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
