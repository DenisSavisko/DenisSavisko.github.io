// Fill these in from icloud.developer.apple.com/dashboard for the
// "iCloud.com.denyssavisko.MyMainGoals" container (same container as
// MyMainGoals/MyMainGoals.entitlements) — see webapp-src/README.md for the manual
// dashboard steps this depends on, none of which can be done from code.
export const CLOUDKIT_CONTAINER_ID = 'iCloud.com.denyssavisko.MyMainGoals';
export const CLOUDKIT_API_TOKEN = '6170c2315a12bafdbf085d41a7aba4be1c2ff12d1689c7e5563ce8a9c12b97b9';

// The app hasn't shipped (no App Store listing yet), so on-device data today lives in
// CloudKit's Development environment, not Production — switch this once the app ships and
// its CloudKit schema is deployed to Production.
export const CLOUDKIT_ENVIRONMENT: 'development' | 'production' = 'development';

// SwiftData's automatic CloudKit mirroring (TaskStore.makeDefaultContainer's
// `cloudKitDatabase: .automatic`) reuses Core Data's private-database naming convention:
// record type and field names get a "CD_" prefix over the @Model class/property names
// (MyMainGoals/GoalTask.swift). Record type and the "CD_" pattern confirmed against the
// actual Development schema (CD_GoalTask, CD_adsWatchedForRelease, CD_completedDate all seen
// there) — title/deadline/isDone/verificationCode specifically follow the same pattern but
// weren't checked field-by-field.
export const GOAL_RECORD_TYPE = 'CD_GoalTask';
export const GOAL_FIELDS = {
  title: 'CD_title',
  deadline: 'CD_deadline',
  isDone: 'CD_isDone',
  verificationCode: 'CD_verificationCode',
} as const;
