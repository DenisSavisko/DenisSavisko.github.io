import { useState } from 'react';
import { BlockHeader, List, ListItem } from 'konsta/react';
import { getCloudKitContainer } from './cloudkit';
import { saveAuthTokenCookie } from './cloudkitAuthPersistence';
import { supabase } from './supabase';
import { signOut } from './signOut';
import { ArrowUpForwardIcon, CheckCircleIcon, DocumentIcon, EnvelopeIcon, IphoneIcon } from './icons';
import { generalSupportMailto } from './support';
import { TERMS_URL } from './stripeConfig';

/// Opens the iPhone app when it's installed, otherwise the App Store. It has to be a separate
/// host (the mymaingoals-open repo): Safari keeps taps on mymaingoals.app itself in the
/// browser, so only a link to another domain can hand off to the app.
const IPHONE_APP_URL = 'https://open.mymaingoals.app/';

/// Laid out like the iOS app's Settings so the two feel the same: Account first, then the link
/// to the other app (here the iPhone app, there the web version), styled as a link that
/// leaves the browser. Lower on the screen also keeps that link in easy thumb reach for the
/// common round trip: stake a goal here, then hop back to the app.
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
      <BlockHeader inset className="uppercase">
        Account
      </BlockHeader>
      <List strong inset>
        <ListItem title="Signed in with Apple ID" media={<CheckCircleIcon className="h-6 w-6 text-green-500" />} />
        <ListItem
          link
          chevron={false}
          title={<span className="text-red-500">{isSigningOut ? 'Signing Out…' : 'Sign Out'}</span>}
          onClick={isSigningOut ? undefined : handleSignOut}
        />
      </List>

      <List strong inset>
        <ListItem
          link
          chevron={false}
          href={IPHONE_APP_URL}
          media={<IphoneIcon className="h-6 w-6 text-primary" />}
          title={<span className="text-primary">MyMainGoals for iPhone</span>}
          after={<ArrowUpForwardIcon className="h-4 w-4 text-black/55 dark:text-white/55" />}
        />
      </List>

      <BlockHeader inset className="uppercase">
        Help
      </BlockHeader>
      <List strong inset>
        <ListItem
          link
          chevron={false}
          href={generalSupportMailto()}
          media={<EnvelopeIcon className="h-6 w-6 text-primary" />}
          title={<span className="text-primary">Contact Support</span>}
        />
        <ListItem
          link
          chevron={false}
          href={TERMS_URL}
          target="_blank"
          media={<DocumentIcon className="h-6 w-6 text-primary" />}
          title={<span className="text-primary">Stake Terms</span>}
          after={<ArrowUpForwardIcon className="h-4 w-4 text-black/55 dark:text-white/55" />}
        />
      </List>
    </>
  );
}
