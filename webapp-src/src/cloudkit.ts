import { CLOUDKIT_API_TOKEN, CLOUDKIT_CONTAINER_ID, CLOUDKIT_ENVIRONMENT, GOAL_FIELDS, GOAL_RECORD_TYPE } from './cloudkitConfig';

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
