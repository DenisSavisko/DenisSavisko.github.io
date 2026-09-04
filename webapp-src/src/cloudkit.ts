import {
  CLOUDKIT_API_TOKEN,
  CLOUDKIT_CONTAINER_ID,
  CLOUDKIT_ENVIRONMENT,
  CORE_DATA_ZONE_ID,
  GOAL_ENTITY_NAME,
  GOAL_FIELDS,
  GOAL_RECORD_TYPE,
} from './cloudkitConfig';

let container: CKContainer | null = null;

/// Configuring twice throws, so this is idempotent — every part of the app that needs
/// CloudKit shares this one container/session.
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

function zoneOptions() {
  return { zoneID: CORE_DATA_ZONE_ID };
}

async function queryAllGoals(container: CKContainer): Promise<CKRecord[]> {
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
export async function ownsGoalWithVerificationCode(container: CKContainer, token: string): Promise<boolean> {
  const records = await queryAllGoals(container);
  return records.some((record) => record.fields[GOAL_FIELDS.verificationCode]?.value === token);
}

/// Mirrors TaskStore.markDone: sets isDone + completedDate on the existing record. Fields are
/// stored as Int(64), not booleans (confirmed against a real record) — 1/0, not true/false.
/// Requires the record's current recordChangeTag (optimistic concurrency) — pass the one from
/// the last read; a stale tag fails the save rather than silently overwriting a newer state.
export async function markGoalDone(
  container: CKContainer,
  goal: { recordName: string; recordChangeTag: string }
): Promise<void> {
  const response = await container.privateCloudDatabase.saveRecord(
    {
      recordType: GOAL_RECORD_TYPE,
      recordName: goal.recordName,
      recordChangeTag: goal.recordChangeTag,
      fields: {
        [GOAL_FIELDS.isDone]: { value: 1 },
        [GOAL_FIELDS.completedDate]: { value: Date.now() },
      },
    },
    zoneOptions()
  );
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
}

/// Mirrors TaskStore.delete.
export async function deleteGoal(container: CKContainer, recordName: string): Promise<void> {
  const response = await container.privateCloudDatabase.deleteRecord(recordName, zoneOptions());
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
}

/// Mirrors TaskStore.addTask — unstaked goals only (see AddGoalSheet.tsx's comment for why
/// staking isn't built on web). recordName is left for CloudKit to generate (confirmed: it's
/// an internal identity, unrelated to CD_id — see cloudkitConfig.ts). CD_id is an ordinary
/// data field the iOS app happens to always populate with a fresh UUID at creation
/// (GoalTask.init's default), so this does the same rather than leaving it unset.
export async function createGoal(
  container: CKContainer,
  params: { title: string; deadline: Date; verificationCode: string | null }
): Promise<void> {
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
  const response = await container.privateCloudDatabase.saveRecord(
    { recordType: GOAL_RECORD_TYPE, fields },
    zoneOptions()
  );
  if (response.hasErrors) {
    throw new Error(response.errors?.[0]?.reason ?? 'Unknown CloudKit error');
  }
}
