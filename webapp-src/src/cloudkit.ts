import {
  CLOUDKIT_API_TOKEN,
  CLOUDKIT_CONTAINER_ID,
  CLOUDKIT_ENVIRONMENT,
  CORE_DATA_ZONE_ID,
  GOAL_ENTITY_NAME,
  GOAL_FIELDS,
  GOAL_RECORD_TYPE,
} from './cloudkitConfig';
import { ADS_REQUIRED_FOR_VERIFICATION_BYPASS } from './adsConfig';
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
///
/// Returns the goal itself (not just "yes/no") for the same reason `matchingLocalTask` is a
/// `GoalTask?` rather than a Bool on iOS: the self-confirm-blocked screen is also where the
/// ad-watching bypass lives, and that needs the goal's own counter to read and write.
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

/// Mirrors the counter half of TaskStore.recordAdWatched — one completed rewarded-ad watch
/// toward releasing this goal's held stake. The release-hold call that follows once the
/// threshold is reached lives in App.tsx (handleAdWatchedForRelease), the same place every
/// other Supabase-then-CloudKit sequence in this client lives.
export async function recordAdWatchedForRelease(
  container: CKContainer,
  goal: { recordName: string; recordChangeTag: string; adsWatchedForRelease: number }
): Promise<CKRecord> {
  return saveGoalFields(container, goal, {
    [GOAL_FIELDS.adsWatchedForRelease]: { value: goal.adsWatchedForRelease + 1 },
  });
}

/// Mirrors TaskStore.recordVerificationBypassAdWatched, including flipping isVerified once
/// the threshold is reached — written in the *same* save rather than as a follow-up
/// markGoalVerified call, since saveGoalFields returns a new recordChangeTag and a second
/// write with the stale one would be rejected outright.
///
/// iOS frames its version as "local-only, never touches the server's is_verified" — but that
/// local SwiftData write mirrors straight to this same CD_isVerified CloudKit field anyway,
/// so writing it directly here reaches the identical end state, just without a local store in
/// between (see ADS_RELEASE_PLAN.md). The server's `task_verifications.is_verified` is
/// untouched by both, which is the part that actually matters.
export async function recordAdWatchedForVerificationBypass(
  container: CKContainer,
  goal: { recordName: string; recordChangeTag: string; adsWatchedForVerificationBypass: number }
): Promise<CKRecord> {
  const watched = goal.adsWatchedForVerificationBypass + 1;
  const fields: Record<string, { value: unknown }> = {
    [GOAL_FIELDS.adsWatchedForVerificationBypass]: { value: watched },
  };
  if (watched >= ADS_REQUIRED_FOR_VERIFICATION_BYPASS) {
    fields[GOAL_FIELDS.isVerified] = { value: 1 };
  }
  return saveGoalFields(container, goal, fields);
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
/// the payment will go through" rule as addStakedTask's own comment). recordName is left for
/// CloudKit to generate (confirmed: it's an internal identity, unrelated to CD_id — see
/// cloudkitConfig.ts). CD_id is an ordinary data field the iOS app happens to always populate
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
  const response = await container.privateCloudDatabase.saveRecords(
    [{ recordType: GOAL_RECORD_TYPE, fields }],
    zoneOptions()
  );
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
  return response.records[0];
}
