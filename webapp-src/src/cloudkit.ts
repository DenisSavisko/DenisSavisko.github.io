import {
  CLOUDKIT_API_TOKEN,
  CLOUDKIT_CONTAINER_ID,
  CLOUDKIT_ENVIRONMENT,
  CORE_DATA_ZONE_ID,
  GOAL_ENTITY_NAME,
  GOAL_FIELDS,
  GOAL_RECORD_TYPE,
} from './cloudkitConfig';
import { restoreAuthTokenCookie } from './cloudkitAuthPersistence';
import { mapRecord, type Goal } from './useGoals';

let container: CKContainer | null = null;

/// Configuring twice throws, so this is idempotent — every part of the app that needs
/// CloudKit shares this one container/session.
export function getCloudKitContainer(): CKContainer {
  if (!container) {
    // Strictly before configure() — that's when CloudKit JS reads the auth cookie to decide
    // whether a session already exists. See cloudkitAuthPersistence.ts for why the cookie
    // needs propping up at all (Safari caps it to 24h in the common share-link case).
    restoreAuthTokenCookie();
    CloudKit.configure({
      containers: [
        {
          containerIdentifier: CLOUDKIT_CONTAINER_ID,
          apiTokenAuth: {
            apiToken: CLOUDKIT_API_TOKEN,
            persist: true,
            // CloudKit JS's default theme name ("medium") isn't one it knows, so it falls back
            // to white-with-outline. Apple's guidelines call for black on light backgrounds
            // and white on dark; the theme is fixed once the button is drawn, so it follows
            // the appearance at load.
            signInButton: {
              id: 'apple-sign-in-button',
              theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'white' : 'black',
            },
          },
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

function zoneOptions() {
  return { zoneID: CORE_DATA_ZONE_ID };
}

/// SwiftData's automatic CloudKit mirroring creates `com.apple.coredata.cloudkit.zone` itself
/// on a device's first sync — every query/save/delete here has always assumed that already
/// happened. It hasn't for anyone who's only ever used the web app: a friend confirming a
/// verification link, signed in with their own Apple ID, has a private database that has
/// *never* had this zone created, and every CloudKit call below fails with "Zone does not
/// exist" — not just loading goals, but creating one too. Creating a zone that already exists
/// is a no-op success (see saveRecordZones's own comment), so this is safe to call before
/// every entry point unconditionally; cached per container so it only actually costs one
/// network round trip.
const zoneEnsured = new WeakMap<CKContainer, Promise<void>>();
export function ensureZoneExists(container: CKContainer): Promise<void> {
  let promise = zoneEnsured.get(container);
  if (!promise) {
    promise = (async () => {
      const response = await container.privateCloudDatabase.saveRecordZones([zoneOptions()]);
      if (response.hasErrors) {
        throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
      }
    })();
    zoneEnsured.set(container, promise);
  }
  return promise;
}

async function queryAllGoals(container: CKContainer): Promise<CKRecord[]> {
  await ensureZoneExists(container);
  const response = await container.privateCloudDatabase.performQuery({ recordType: GOAL_RECORD_TYPE }, zoneOptions());
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
  return response.records;
}

/// Mirrors VerifyGoalView.matchingLocalTask on iOS, which checks the device's local SwiftData
/// store for a task with this verification code — the entire self-confirm block, since a real
/// confirming friend never has this goal in their own list. On web there's no local store, but
/// there is a real signed-in identity via CloudKit JS, so this queries the signed-in user's
/// own synced goals instead of trusting a device-local cache.
export async function ownsGoalWithVerificationCode(container: CKContainer, token: string): Promise<Goal | null> {
  const records = await queryAllGoals(container);
  const match = records.find((record) => record.fields[GOAL_FIELDS.verificationCode]?.value === token);
  return match ? mapRecord(match) : null;
}

/// Shared by every "update a few fields on an existing goal" write — markGoalDone,
/// markGoalVerified, updateGoalStakeStatus. Requires the record's current recordChangeTag
/// (optimistic concurrency) — pass the one from the last read; a stale tag fails the save
/// rather than silently overwriting a newer state. Returns the saved record (with a fresh
/// recordChangeTag) — CloudKit's query index can lag several seconds behind a successful
/// write, so callers use this to update local state immediately instead of waiting on a
/// performQuery that might not show the change yet (see useGoals.ts's applyOverride).
async function saveGoalFields(
  container: CKContainer,
  goal: { recordName: string; recordChangeTag: string },
  fields: Record<string, { value: unknown }>
): Promise<CKRecord> {
  await ensureZoneExists(container);
  const response = await container.privateCloudDatabase.saveRecords(
    [
      {
        recordType: GOAL_RECORD_TYPE,
        recordName: goal.recordName,
        recordChangeTag: goal.recordChangeTag,
        fields,
      },
    ],
    zoneOptions()
  );
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
  return response.records[0];
}

/// Mirrors TaskStore.markDone: sets isDone + completedDate. Fields are stored as Int(64), not
/// booleans (confirmed against a real record) — 1/0, not true/false.
export async function markGoalDone(container: CKContainer, goal: { recordName: string; recordChangeTag: string }): Promise<CKRecord> {
  return saveGoalFields(container, goal, {
    [GOAL_FIELDS.isDone]: { value: 1 },
    [GOAL_FIELDS.completedDate]: { value: Date.now() },
  });
}

/// Mirrors TaskStore.markVerified — flips isVerified once VerificationSync-equivalent
/// (useBackgroundSync.ts) confirms the friend has confirmed.
export async function markGoalVerified(container: CKContainer, goal: { recordName: string; recordChangeTag: string }): Promise<CKRecord> {
  return saveGoalFields(container, goal, { [GOAL_FIELDS.isVerified]: { value: 1 } });
}

/// Mirrors TaskStore.updateStakeStatus.
export async function updateGoalStakeStatus(
  container: CKContainer,
  goal: { recordName: string; recordChangeTag: string },
  status: string
): Promise<CKRecord> {
  return saveGoalFields(container, goal, { [GOAL_FIELDS.stakeStatus]: { value: status } });
}

/// Mirrors TaskStore.delete.
export async function deleteGoal(container: CKContainer, recordName: string): Promise<void> {
  await ensureZoneExists(container);
  const response = await container.privateCloudDatabase.deleteRecords([recordName], zoneOptions());
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
}

/// Mirrors TaskStore.addTask/addStakedTask (params.stake is only set from the latter's call
/// site — see AddGoalSheet.tsx, which only reaches this with a stake after create-hold has
/// already confirmed the PaymentIntent, same "never insert a staked goal locally on a hope
/// the payment will go through" rule as addStakedTask's own comment). recordName is chosen
/// here rather than by CloudKit (it's an internal identity, unrelated to CD_id — see
/// cloudkitConfig.ts), so a save whose reply got lost can still be checked: see
/// saveNewRecordConfirmed. CD_id is an ordinary data field the iOS app happens to always populate
/// with a fresh UUID at creation (GoalTask.init's default), so this does the same rather than
/// leaving it unset.
export async function createGoal(
  container: CKContainer,
  params: {
    title: string;
    deadline: Date;
    verificationCode: string | null;
    stake: { amountCents: number; paymentIntentId: string } | null;
  }
): Promise<CKRecord> {
  await ensureZoneExists(container);
  const now = Date.now();
  const fields: Record<string, { value: unknown }> = {
    [GOAL_FIELDS.entityName]: { value: GOAL_ENTITY_NAME },
    [GOAL_FIELDS.id]: { value: crypto.randomUUID() },
    [GOAL_FIELDS.title]: { value: params.title },
    [GOAL_FIELDS.deadline]: { value: params.deadline.getTime() },
    [GOAL_FIELDS.createdAt]: { value: now },
    [GOAL_FIELDS.isDone]: { value: 0 },
    [GOAL_FIELDS.requiresVerification]: { value: params.verificationCode ? 1 : 0 },
    [GOAL_FIELDS.isVerified]: { value: 0 },
    // Retired counters nothing reads any more, still written as 0 because the iOS app's
    // SwiftData schema keeps them as non-optional columns.
    [GOAL_FIELDS.adsWatchedForRelease]: { value: 0 },
    [GOAL_FIELDS.adsWatchedForVerificationBypass]: { value: 0 },
  };
  // Left unset (matches GoalTask.init's `verificationCode: String? = nil` default) rather
  // than writing an empty string, for a goal that doesn't need a friend's confirmation.
  if (params.verificationCode) {
    fields[GOAL_FIELDS.verificationCode] = { value: params.verificationCode };
  }
  if (params.stake) {
    fields[GOAL_FIELDS.stakeAmountCents] = { value: params.stake.amountCents };
    fields[GOAL_FIELDS.stripePaymentIntentId] = { value: params.stake.paymentIntentId };
    fields[GOAL_FIELDS.stakeStatus] = { value: 'held' };
  }
  return saveNewRecordConfirmed(container.privateCloudDatabase, {
    recordType: GOAL_RECORD_TYPE,
    recordName: crypto.randomUUID(),
    fields,
  });
}

const CONFIRM_RETRY_DELAY_MS = 800;

/// Saves a new record, and when the save reports a failure, checks whether it landed anyway
/// before giving up. A save can succeed on Apple's side and still look like a network error
/// here (the reply got lost), and for a staked goal giving up means cancelling the hold of a
/// goal that exists. Retries the save once if the record really isn't there.
export async function saveNewRecordConfirmed(
  database: Pick<CKDatabase, 'saveRecords' | 'fetchRecords'>,
  record: { recordType: string; recordName: string; fields: CKRecordFields },
  retryDelayMs = CONFIRM_RETRY_DELAY_MS
): Promise<CKRecord> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await database.saveRecords([record], zoneOptions());
      if (!response.hasErrors) return response.records[0];
      lastError = new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    try {
      const existing = await database.fetchRecords([record.recordName], zoneOptions());
      if (!existing.hasErrors && existing.records[0]) return existing.records[0];
    } catch {
      // Couldn't tell either way: try the save once more, then report the original error.
    }
  }
  throw lastError;
}
