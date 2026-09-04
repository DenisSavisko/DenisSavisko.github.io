// Fill these in from icloud.developer.apple.com/dashboard for the
// "iCloud.com.denyssavisko.MyMainGoals" container (same container as
// MyMainGoals/MyMainGoals.entitlements) — see webapp-src/README.md for the manual
// dashboard steps this depends on, none of which can be done from code.
export const CLOUDKIT_CONTAINER_ID = 'iCloud.com.denyssavisko.MyMainGoals';
export const CLOUDKIT_API_TOKEN = 'REPLACE_WITH_WEB_SERVICES_API_TOKEN';

// The app hasn't shipped (no App Store listing yet), so on-device data today lives in
// CloudKit's Development environment, not Production — switch this once the app ships and
// its CloudKit schema is deployed to Production.
export const CLOUDKIT_ENVIRONMENT: 'development' | 'production' = 'development';

// SwiftData's automatic CloudKit mirroring (TaskStore.makeDefaultContainer's
// `cloudKitDatabase: .automatic`) reuses Core Data's private-database naming convention:
// record type and field names get a "CD_" prefix over the @Model class/property names
// (MyMainGoals/GoalTask.swift). Confirm these against Schema in the CloudKit Dashboard
// (Development environment) — this is inferred from SwiftData's known behavior, not
// verified against this project's actual dashboard.
export const GOAL_RECORD_TYPE = 'CD_GoalTask';
export const GOAL_FIELDS = {
  title: 'CD_title',
  deadline: 'CD_deadline',
  isDone: 'CD_isDone',
} as const;
