// CloudKit JS is loaded via a <script> tag (cdn.apple-cloudkit.com), not an npm package —
// no official type definitions exist, so this is a minimal ambient declaration covering only
// what cloudkit.ts/useGoals.ts/VerifyModal.tsx actually use. Verified against the actual
// served cloudkit.js source (not just docs/tutorials), since getting this wrong risks writing
// bad data to the user's real CloudKit records.
declare const CloudKit: {
  configure(options: {
    containers: Array<{
      containerIdentifier: string;
      apiTokenAuth: { apiToken: string; persist: boolean };
      environment: 'development' | 'production';
    }>;
  }): void;
  getDefaultContainer(): CKContainer;
};

interface CKUserIdentity {
  userRecordName?: string;
  lookupInfo?: unknown;
}

interface CKContainer {
  setUpAuth(): Promise<CKUserIdentity | null>;
  whenUserSignsIn(): Promise<CKUserIdentity>;
  whenUserSignsOut(): Promise<void>;
  privateCloudDatabase: CKDatabase;
}

interface CKZoneID {
  zoneName: string;
}

interface CKRecordFields {
  [key: string]: { value: unknown };
}

interface CKRecord {
  recordName: string;
  recordType?: string;
  recordChangeTag?: string;
  fields: CKRecordFields;
}

interface CKQueryResponse {
  hasErrors: boolean;
  errors?: Array<{ reason: string }>;
  records: CKRecord[];
}

interface CKSaveResponse {
  hasErrors: boolean;
  errors?: Array<{ reason: string }>;
  records: CKRecord[];
}

interface CKDatabase {
  /// Second argument is required for anything Core Data/SwiftData-synced — without an
  /// explicit zoneID, CloudKit JS defaults to "_defaultZone", not Core Data's real custom
  /// zone ("com.apple.coredata.cloudkit.zone", see CORE_DATA_ZONE_ID), and silently returns
  /// nothing instead of erroring.
  performQuery(query: { recordType: string }, options?: { zoneID?: CKZoneID }): Promise<CKQueryResponse>;
  saveRecord(record: { recordType: string; recordName?: string; recordChangeTag?: string; fields: CKRecordFields }, options?: { zoneID?: CKZoneID }): Promise<CKSaveResponse>;
  deleteRecord(recordName: string, options?: { zoneID?: CKZoneID }): Promise<CKSaveResponse>;
}
