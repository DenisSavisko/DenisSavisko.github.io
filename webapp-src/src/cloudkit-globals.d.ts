// CloudKit JS is loaded via a <script> tag (cdn.apple-cloudkit.com), not an npm package —
// no official type definitions exist, so this is a minimal ambient declaration covering only
// what goals.ts actually uses.
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

interface CKQueryResponse<T = Record<string, { value: unknown }>> {
  hasErrors: boolean;
  errors?: Array<{ reason: string }>;
  records: Array<{ recordName: string; fields: T }>;
}

interface CKDatabase {
  performQuery(query: { recordType: string }): Promise<CKQueryResponse>;
}
