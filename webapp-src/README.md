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

**Fully gated by sign-in**: nothing (tabs, create, the `+` button, `VerifyModal`) is usable
until `useCloudKitAuth`'s status is `'signed-in'` — `App.tsx` renders only the sign-in prompt
otherwise. A `#verify/<token>` hash present at sign-in time is deliberately left untouched
(never cleared just because sign-in hasn't happened) so the confirm sheet opens itself the
moment sign-in completes, without the link having to be re-opened.

The tab bar is a hand-rolled floating "Liquid Glass" pill (`GlassTabbar.tsx`), not Konsta's
own `<Tabbar>`/`<TabbarLink>` — those render the previous-generation edge-to-edge bar, and
Konsta doesn't expose a floating-glass variant. It composes Konsta's `<Glass>` primitive
(translucent blur) with plain buttons instead, with `highlight={false}` — see that file's
comment for why (a real, since-fixed bug, not a stylistic choice).

`useGoals.ts`'s `applyOverride`: CloudKit's query index can lag several seconds behind a
write that already succeeded, so `performQuery` right after a create/mark-done/delete can
still return the pre-write state. Every write helper in `cloudkit.ts` returns the record it
actually produced, and callers (`App.tsx`, `AddGoalSheet.tsx`) feed that straight into a
short-lived (20s) local override layered over fetched state, so the UI reflects a write
immediately instead of waiting for CloudKit's index to catch up.

**Writable**: mark done (`ActiveTab.tsx`'s circle tap → `markGoalDone`, releasing the Stripe
hold via `staking.ts`'s `releaseHold` for staked goals, mirrors `ActiveListView.toggleDone`),
delete (trash icon on every tab, same `isDeletable`/"still held" gating as iOS, mirrors
`deleteTask`), and create (`AddGoalSheet.tsx`, mirrors `AddTaskSheet` — title, deadline,
optional "require confirmation from someone else" toggle wired to the same
`create_verification` RPC and `ShareVerificationSheet.tsx`, mirroring `ShareVerificationPrompt`).

**Staking**: `AddGoalSheet.tsx` collects a card via Stripe (`@stripe/react-stripe-js`,
`CardElement`, plus a `PaymentRequestButtonElement` for Apple Pay once
`mymaingoals.app` is registered as a payment method domain in the Stripe Dashboard — a single
integration handles both, no separate Apple Pay JS code path). `staking.ts`'s `createHold`
calls the same `create-hold` edge function iOS uses; a card that comes back `requires_action`
(3D Secure) is resolved client-side via `stripe.confirmCardPayment`, mirroring what
`ApplePayContext` does internally on iOS with the same `clientSecret`. The goal is only ever
written to CloudKit after the hold is confirmed (`createGoal`'s comment), same
"never insert a staked goal locally on a hope the payment will go through" rule as
`TaskStore.addStakedTask`. Verified end-to-end against the live (test-mode) Stripe/Supabase
functions via curl with Stripe's `pm_card_visa` test token, and since then against the real
browser UI on iPhone Safari (card entry, the Apple Pay sheet, 3D Secure) — there's no browser
tooling in *this* environment, so any future UI verification here still has to go through the
user rather than a screenshot/click loop.

**Edge Functions need CORS added by hand**: unlike Supabase RPCs (`supabase.rpc()`,
PostgREST, CORS-enabled by default), a `supabase.functions.invoke()` call needs the target
function to handle `OPTIONS` and set CORS headers itself — `create-hold`/`release-hold`
originally only had to work from native iOS (no CORS needed at all) and broke silently
("Failed to send a request to edge function") the first time this web client called them.
See `supabase/functions/_shared/cors.ts` in the `MyMainGoals` repo — every Edge Function this
web client calls needs that same `OPTIONS` short-circuit + headers-on-every-response
treatment, including any new one added later.

**Still out of scope**: the ads-driven release/verification-bypass flows (AdMob, iOS-only —
no ad SDK or ad revenue path exists on web). The floating `+` button disables itself once 3
active goals exist, matching `TaskStore.canAddTask`, rather than opening a sheet that then
explains why it can't do anything.

Mark-done and delete both go through `usePendingAction.ts`, mirroring iOS's `PendingAction` —
a few seconds to undo (tap to cancel) before the write actually fires.

A `#verify/<token>` hash opens the friend-verification confirm flow (`VerifyModal.tsx`,
`verification.ts`, `supabase.ts`) as a closable bottom sheet *on top of* the Goals tab, the same
way `VerifyGoalView` is a sheet over the app's main task list on iOS — it never replaces the
page. Confirming still requires signing in (the same shared CloudKit session), and if the
signed-in person's own synced goals include that verification code, it blocks with "this is
your own goal" instead of showing Confirm — mirrors `VerifyGoalView.matchingLocalTask` on iOS,
backed by a real CloudKit query instead of a local device store.

**Background sync** (`useBackgroundSync.ts`, running alongside `useGoals`'s own refresh cycle
— tab focus, the 20s poll) mirrors three iOS foreground tasks that would otherwise only ever
happen on a full relaunch: `VerificationSync.syncPendingVerifications` (a friend confirming
elsewhere never reached a web-only goal owner without this), `StakeSync.retryPendingReleases`
(a release-hold call that didn't confirm the first time), and `StakeSync.syncHeldStatuses`
(the expiry cron capturing a stake with no client call at all, for a goal staked on iOS and
viewed on web).

The manual CloudKit Dashboard steps below (API token, schema check, queryable index) are done
as of this writing — `cloudkitConfig.ts` has a real token and `CD_GoalTask`/`recordName` are
confirmed against the actual Development schema. Revisit this section if either the Goals tab
or the self-confirm check start failing again (e.g. after rotating the token, or if the schema
changes).

## iOS Safari quirks fixed here (don't reintroduce)

- **Phantom/double scroll**: Konsta's `<App>` sizes itself with `min-h-screen` (100vh, see
  `AppClasses.js`) — iOS Safari's `100vh` is the height with its address bar hidden, taller
  than what's actually visible whenever the bar is showing. `index.css` caps `.k-app` itself
  to `min-height: 100dvh` (overriding that utility class — confirmed to win the cascade since
  it's declared after Tailwind's own utility layer in the same file) rather than blocking
  scroll on `html`/`body` outright — an earlier attempt did that and broke Safari's native
  pull-to-refresh gesture as a side effect, since that's a rubber-band bounce of the
  document's own scroll.
- **Tab bar icon/label fading to white on very fast repeated taps**: not a CSS transition
  issue (a first attempt assumed so and was wrong) — it's Konsta's `<Glass>` iOS hover
  highlight (`use-ios-highlight.js`) creating a new translucent overlay span on every
  `pointerenter` without checking whether a previous one is still mid-removal. Fast alternating
  taps fire `pointerenter` faster than each overlay fades out, so they visually stack. Fixed by
  passing `highlight={false}` to `GlassTabbar.tsx`'s `<Glass>` — not needed on a nav bar anyway.
- **Tailwind + template literals**: a `className` template literal that glues a utility class
  directly against a `${...}` interpolation with no space between them (e.g. `` `!w-16${cond ? '...' : ''}` ``)
  can make Tailwind's source scanner silently drop that class — always leave a literal space
  before an interpolation, and verify a suspicious override actually landed by grepping the
  built CSS (`grep -o '!w-16{[^}]*}' webapp/assets/*.css`) rather than trusting it visually.

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
4b. **Zone**: Core Data/SwiftData puts every record in a custom zone,
   `com.apple.coredata.cloudkit.zone` (`CORE_DATA_ZONE_ID` in `cloudkitConfig.ts`), never the
   private database's default zone. Confirmed against the real `cloudkit.js` source: an
   omitted `zoneID` silently defaults to `"_defaultZone"` (empty) rather than erroring — every
   query/save/delete against `GOAL_RECORD_TYPE` must pass this zone explicitly, or it'll look
   like there's simply no data.

   That zone only exists in a given user's private database once *something* has created it —
   normally SwiftData's automatic CloudKit mirroring, the first time the iOS app runs signed
   into that iCloud account. Anyone who's only ever used the web app (a friend confirming a
   verification link, say, signed in with their own Apple ID) has never had that happen, and
   every CloudKit call failed for them with "Zone does not exist" — not just loading goals, but
   creating one too. `cloudkit.ts`'s `ensureZoneExists` (called at the top of every query/save/
   delete) fixes this by creating the zone itself via `saveRecordZones` if needed — a no-op
   success if it's already there, so it's safe to call unconditionally.
5. **API Access tab**: enable Web Services for this container and generate a Web Services
   API Token. Paste it into `CLOUDKIT_API_TOKEN` in `cloudkitConfig.ts`.
6. **Allowed origins** (same API Access area, Sign-in with Apple ID / CORS config for
   CloudKit JS): add `https://mymaingoals.app`, and `http://localhost:<port>` if testing
   locally via `npm run dev`.

None of the above can be scripted — it's all manual configuration in Apple's web dashboard
tied to the developer account.
