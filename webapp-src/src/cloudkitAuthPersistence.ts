import { CLOUDKIT_CONTAINER_ID } from './cloudkitConfig';

/// Keeps the CloudKit sign-in from expiring after ~24 hours.
///
/// CloudKit JS's `persist: true` stores the web auth token in a cookie keyed by the container
/// id, written from JavaScript with a 14-day expiry (confirmed by reading the served
/// cloudkit.js — its setCookie hardcodes `var n = 14`). Safari's ITP caps JS-written
/// first-party cookies well below that: 7 days normally, and 24 hours when the visitor
/// arrived via a cross-site navigation from a domain classified as having tracking
/// capability — which is exactly how someone opening a share link from Messages gets here.
/// That cap, not CloudKit or anything in this app, is why sign-in was lasting about a day.
///
/// localStorage isn't subject to the 24-hour rule (it's still purged after ~7 days of no
/// interaction), so mirroring the cookie there and restoring it before CloudKit.configure()
/// turns a daily re-auth into a roughly weekly one. That's the ceiling from a static site:
/// only a server setting the cookie over HTTP escapes ITP's script-written-storage rules,
/// and CloudKit JS owns this cookie either way.
///
/// If Apple expires the token server-side sooner than the cookie lives, a restored token
/// just fails to authenticate and reads as signed-out — the same state as having no cookie
/// at all, so this can't strand anyone in a broken half-signed-in state.

const STORAGE_KEY = `ck-auth-token:${CLOUDKIT_CONTAINER_ID}`;

/// Byte-for-byte the same format cloudkit.js's own setCookie writes (14-day expiry, bare
/// hostname, empty path), so a restored cookie lands at the same path as one CloudKit JS
/// wrote itself. Deviating — `path=/`, say — would risk two same-named cookies at different
/// paths, and cloudkit.js's reader takes whichever `document.cookie` lists first.
function writeCookie(value: string): void {
  const expiry = new Date();
  expiry.setTime(expiry.getTime() + 14 * 24 * 60 * 60 * 1000);
  const hostname = window.location.hostname;
  const domain = /\./.test(hostname) ? hostname : '';
  document.cookie = `${CLOUDKIT_CONTAINER_ID}=${value}; expires=${expiry.toUTCString()}; ${domain}; path=`;
}

function readCookie(): string | null {
  const prefix = `${CLOUDKIT_CONTAINER_ID}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trimStart();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/// Must run before CloudKit.configure() — that's when CloudKit JS reads the cookie to decide
/// whether there's an existing session. Called from getCloudKitContainer() so the ordering
/// can't be got wrong by a caller.
export function restoreAuthTokenCookie(): void {
  try {
    // A live cookie is authoritative; only a missing one gets refilled from the mirror.
    if (readCookie()) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) writeCookie(saved);
  } catch {
    // Private mode, or storage/cookies blocked outright — sign-in still works for this
    // session, it just won't outlive the cookie.
  }
}

/// Called on every auth transition (see useCloudKitAuth). Clearing the mirror when the cookie
/// is gone is the half that matters most: without it, signing out would leave a dead token
/// behind for the next visit to restore.
export function saveAuthTokenCookie(): void {
  try {
    const token = readCookie();
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above — best-effort.
  }
}
