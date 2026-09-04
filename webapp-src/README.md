# webapp-src

Source for `mymaingoals.app/webapp/` — see `WEB_PLAN.md` in the `MyMainGoals` repo
for the overall design.

## Stack

React + [Konsta UI](https://konstaui.com) (`theme="ios"`) + Tailwind CSS v4, built with Vite.
Konsta gives iOS-native-looking primitives (Navbar, Tabbar, List, Sheet, Fab) as Tailwind
classes — chosen specifically to get close to the real iOS app's look without hand-rolling
every UIKit convention. No React Router — the whole app is one page, `App.tsx`, switching
between three tabs with local state and reading `#verify/<token>` out of the URL hash directly.

## Structure — mirrors ContentView.swift on iOS

`App.tsx` renders the same 3-tab shell as `ContentView`: **Goals** (`ActiveTab.tsx`, mirrors
`ActiveListView`), **Done** (`DoneTab.tsx`, mirrors `DoneListView`, grouped by month), **Failed**
(`FailedTab.tsx`, mirrors `FailedListView`, grouped by month, tab badge = pending-release count).
All three read from one shared `useGoals()` hook (CloudKit JS query, filtered/sorted exactly
like `TaskStore.activeTasks`/`doneTasks`/`failedTasks`). Sign in with your Apple ID via CloudKit
JS to see your goals — one shared button in the navbar (`AppleSignInButton.tsx`), not
per-tab, since CloudKit JS only supports one such element on the page (see its comment).

**Read-only, and no goal creation yet** — the floating `+` button (mirrors `ContentView`'s Fab)
opens a "coming soon" sheet instead of a real add-goal flow; toggling done, swipe-to-delete,
and staking/payments would all be real CloudKit/Supabase writes, a bigger separate effort not
built here. This is a structural-parity pass on the read side, not full feature parity.

A `#verify/<token>` hash opens the friend-verification confirm flow (`VerifyModal.tsx`,
`verification.ts`, `supabase.ts`) as a closable bottom sheet *on top of* the Goals tab, the same
way `VerifyGoalView` is a sheet over the app's main task list on iOS — it never replaces the
page. Confirming still requires signing in (the same shared CloudKit session), and if the
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
   `CD_GoalTask` and its fields (see `GOAL_FIELDS` in `cloudkitConfig.ts`) — the record type
   itself and the `CD_` pattern are confirmed against the actual dashboard, but not every
   individual field.
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
