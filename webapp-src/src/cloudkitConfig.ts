// Fill these in from icloud.developer.apple.com/dashboard for the
// "iCloud.com.denyssavisko.MyMainGoals" container (same container as
// MyMainGoals/MyMainGoals.entitlements) — see webapp-src/README.md for the manual
// dashboard steps this depends on, none of which can be done from code.
export const CLOUDKIT_CONTAINER_ID = 'iCloud.com.denyssavisko.MyMainGoals';
// Production, matching App Store/TestFlight installs of the iOS app. Builds run from Xcode
// use Development — a separate database — so they won't see the same goals as this.
export const CLOUDKIT_ENVIRONMENT: 'development' | 'production' = 'production';

// API tokens are per environment — a Development token against Production fails with
// AUTHENTICATION_FAILED (401) — so the token follows CLOUDKIT_ENVIRONMENT rather than being
// a separate setting that can drift from it. Public by design: they ship in the client JS and
// are restricted by the dashboard's Allowed Origins.
const CLOUDKIT_API_TOKENS = {
  development: '6170c2315a12bafdbf085d41a7aba4be1c2ff12d1689c7e5563ce8a9c12b97b9',
  production: '9bdc5e22aa01aeb928573021678a1907e802a829372c81c60abede1a4a3b1128',
} as const;
export const CLOUDKIT_API_TOKEN = CLOUDKIT_API_TOKENS[CLOUDKIT_ENVIRONMENT];

// Core Data/SwiftData's CloudKit mirroring puts everything in this custom zone, never the
// private database's default zone — confirmed against the actual cloudkit.js source, which
// silently defaults an omitted zoneID to "_defaultZone" (empty) rather than erroring. Every
// query/save/delete against GOAL_RECORD_TYPE must pass this explicitly.
export const CORE_DATA_ZONE_ID = { zoneName: 'com.apple.coredata.cloudkit.zone' };

// SwiftData's automatic CloudKit mirroring (TaskStore.makeDefaultContainer's
// `cloudKitDatabase: .automatic`) reuses Core Data's private-database naming convention:
// record type and field names get a "CD_" prefix over the @Model class/property names
// (MyMainGoals/GoalTask.swift). Fully confirmed against one real record's complete field
// list in the CloudKit Dashboard (15 fields, exactly matching GoalTask's own properties plus
// CD_entityName) — not just inferred from the naming pattern anymore.
export const GOAL_RECORD_TYPE = 'CD_GoalTask';
export const GOAL_ENTITY_NAME = 'GoalTask';
export const GOAL_FIELDS = {
  id: 'CD_id',
  title: 'CD_title',
  deadline: 'CD_deadline',
  isDone: 'CD_isDone',
  completedDate: 'CD_completedDate',
  createdAt: 'CD_createdAt',
  stakeAmountCents: 'CD_stakeAmountCents',
  stripePaymentIntentId: 'CD_stripePaymentIntentId',
  stakeStatus: 'CD_stakeStatus',
  adsWatchedForRelease: 'CD_adsWatchedForRelease',
  requiresVerification: 'CD_requiresVerification',
  verificationCode: 'CD_verificationCode',
  isVerified: 'CD_isVerified',
  adsWatchedForVerificationBypass: 'CD_adsWatchedForVerificationBypass',
  entityName: 'CD_entityName',
} as const;
