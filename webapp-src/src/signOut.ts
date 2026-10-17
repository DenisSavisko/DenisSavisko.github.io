/// Everything signOut touches, passed in so the order can be tested.
export interface SignOutDeps {
  signOutOfCloudKit: () => void;
  /// Re-syncs the localStorage copy of CloudKit's auth cookie (cloudkitAuthPersistence.ts),
  /// which removes it once the cookie is gone.
  syncSavedAuthToken: () => void;
  signOutOfSupabase: () => Promise<unknown>;
  reloadSignedOut: () => void;
}

/// Signs out of both iCloud (goals) and the backend (verification and stakes), then reloads
/// to a clean signed-out page. The reload is deliberate: CloudKit's signOut() doesn't re-show
/// its sign-in button the way its own sign-out button does, and the app only listens for one
/// sign-in/sign-out per page load (useCloudKitAuth), so a fresh load is the one state that's
/// certain to be right. The saved auth token must go too, or the next load would restore it
/// and quietly sign straight back in.
export async function signOut(deps: SignOutDeps): Promise<void> {
  deps.signOutOfCloudKit();
  deps.syncSavedAuthToken();
  try {
    await deps.signOutOfSupabase();
  } catch {
    // A failed backend sign-out mustn't keep someone signed into iCloud on a shared computer.
  }
  deps.reloadSignedOut();
}
