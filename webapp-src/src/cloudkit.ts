import { CLOUDKIT_API_TOKEN, CLOUDKIT_CONTAINER_ID, CLOUDKIT_ENVIRONMENT, GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';

let container: CKContainer | null = null;
let authPromise: Promise<CKUserIdentity | null> | null = null;

/// Configuring twice throws, so this is idempotent — both the verify modal and the Goals tab
/// share one CloudKit session underneath.
export function getCloudKitContainer(): CKContainer {
  if (!container) {
    CloudKit.configure({
      containers: [
        {
          containerIdentifier: CLOUDKIT_CONTAINER_ID,
          apiTokenAuth: { apiToken: CLOUDKIT_API_TOKEN, persist: true },
          environment: CLOUDKIT_ENVIRONMENT,
        },
      ],
    });
    container = CloudKit.getDefaultContainer();
  }
  return container;
}

export function isCloudKitConfigured(): boolean {
  return !CLOUDKIT_API_TOKEN.startsWith('REPLACE_');
}

/// setUpAuth() injects into #apple-sign-in-button as a side effect and isn't meant to be
/// called more than once per container — the Goals tab and the verify modal both need the
/// resulting sign-in state, so they share this one call instead of each making their own.
export function ensureCloudKitAuth(): Promise<CKUserIdentity | null> {
  if (!authPromise) {
    authPromise = getCloudKitContainer().setUpAuth();
  }
  return authPromise;
}

/// CloudKit JS only supports one #apple-sign-in-button element on the page (it looks it up
/// by that fixed id), so there's exactly one such node, created once by the Goals tab. The
/// verify modal borrows it — moving the same DOM node preserves whatever CloudKit JS attached
/// to it — and this returns a callback that puts it back where it came from on modal close.
export function relocateSignInButton(target: HTMLElement): () => void {
  const el = document.getElementById('apple-sign-in-button');
  if (!el) return () => {};
  const originalParent = el.parentElement;
  const originalNext = el.nextSibling;
  target.appendChild(el);
  return () => {
    if (originalParent) originalParent.insertBefore(el, originalNext);
  };
}

/// Mirrors VerifyGoalView.matchingLocalTask on iOS, which checks the device's local SwiftData
/// store for a task with this verification code — the entire self-confirm block, since a real
/// confirming friend never has this goal in their own list. On web there's no local store, but
/// there is a real signed-in identity via CloudKit JS, so this queries the signed-in user's
/// own synced goals instead of trusting a device-local cache.
export async function ownsGoalWithVerificationCode(container: CKContainer, token: string): Promise<boolean> {
  const response = await container.privateCloudDatabase.performQuery({ recordType: GOAL_RECORD_TYPE });
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
  return response.records.some((record) => record.fields[GOAL_FIELDS.verificationCode]?.value === token);
}
