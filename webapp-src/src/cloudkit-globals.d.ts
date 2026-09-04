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
  /// Plural, batch-based — there is no singular saveRecord/deleteRecord in this CloudKit JS
  /// version (v2, cdn.apple-cloudkit.com/ck/2/). Confirmed against the actual served
  /// cloudkit.js source: these dispatch through RecordsBatchBuilder#createOrUpdate/
  /// #forceDelete under the hood. Each item may be a plain record object (save) or a bare
  /// recordName string (delete) — normalizeRecords wraps single items into a one-element
  /// array either way, so passing a single item (not wrapped in []) also works, but arrays
  /// are used here for clarity given the plural name.
  saveRecords(
    records: Array<{ recordType: string; recordName?: string; recordChangeTag?: string; fields: CKRecordFields }>,
    options?: { zoneID?: CKZoneID }
  ): Promise<CKSaveResponse>;
  deleteRecords(recordNames: string[], options?: { zoneID?: CKZoneID }): Promise<CKSaveResponse>;
}
