# webapp-src

Source for `mymaingoals.app/webapp/` — see `WEB_PLAN.md` in the `MyMainGoals` repo
for the overall design.

The Goals tab (`goals.ts`) is the permanent base view — sign in with your Apple ID via
CloudKit JS, list your goals and their status, read-only. A `#verify/<token>` hash opens the
friend-verification confirm flow (`verifyModal.ts`, `verification.ts`, `supabase.ts`) as a
closable modal *on top of* the Goals tab, the same way `VerifyGoalView` is a sheet over the
app's main task list on iOS — it never replaces the page. Confirming still requires signing in
(CloudKit JS, shared with the Goals tab via `cloudkit.ts`'s `ensureCloudKitAuth()`), and if the
signed-in person's own synced goals include that verification code, it blocks with "this is
your own goal" instead of showing Confirm — mirrors `VerifyGoalView.matchingLocalTask` on iOS,
backed by a real CloudKit query instead of a local device store.

The manual CloudKit Dashboard steps below (API token, schema check, queryable index) are done
as of this writing — `cloudkitConfig.ts` has a real token and `CD_GoalTask`/`recordName` are
confirmed against the actual Development schema. Revisit this section if either the Goals tab
or the self-confirm check start failing again (e.g. after rotating the token, or if the schema
changes).

## CloudKit JS setup (required before the Goals tab works)

1. Go to https://icloud.developer.apple.com/dashboard, select the
   `iCloud.com.denyssavisko.MyMainGoals` container (same one in
   `MyMainGoals/MyMainGoals.entitlements`).
2. **Environment**: use *Development*, not Production — the app has no App Store listing yet
   (`app-id=0000000000` placeholders elsewhere in this repo), so real on-device data today
   lives in Development. Switch `CLOUDKIT_ENVIRONMENT` in `cloudkitConfig.ts` once that
   changes.
3. **Schema check** (Development → Schema → Record Types): confirm the actual record type
   and field names for goals, and fix `cloudkitConfig.ts` if they don't match. This repo
   currently assumes SwiftData's known Core-Data-style naming convention (`CD_` prefix over
   the `@Model` class/property names in `MyMainGoals/GoalTask.swift`) —
   `CD_GoalTask` / `CD_title` / `CD_deadline` / `CD_isDone` — but that's inferred, not
   confirmed against this project's actual dashboard.
4. **Queryable index**: SwiftData/Core Data records synced to CloudKit are often not
   queryable by default — CloudKit requires an explicit Queryable index on a field (commonly
   `recordName`) before `performQuery({ recordType: ... })` returns anything. If the Goals
   tab loads but the list stays empty despite having goals on your phone, this is the first
   thing to check (Development → Schema → `CD_GoalTask` → Indexes).
5. **API Access tab**: enable Web Services for this container and generate a Web Services
   API Token. Paste it into `CLOUDKIT_API_TOKEN` in `cloudkitConfig.ts`.
6. **Allowed origins** (same API Access area, Sign-in with Apple ID / CORS config for
   CloudKit JS): add `https://mymaingoals.app`, and `http://localhost:<port>` if testing
   locally via `npm run dev`.

None of the above can be scripted — it's all manual configuration in Apple's web dashboard
tied to the developer account.
