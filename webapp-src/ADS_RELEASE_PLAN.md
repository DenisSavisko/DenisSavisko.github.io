# Ads on web: watch ads to release a held stake, or to self-confirm a gated goal

Status: **not built yet**. This is the plan for web's item #5 (the last item from the original
"what's left" list — everything else on it shipped this session). Read this file fresh in any
new/compacted session before touching web ads code.

Mirrors two iOS features (`MyMainGoals/ADS_RELEASE_PLAN.md`, `TaskStore.swift`,
`AdReleaseCoordinator.swift`, `FailedListView.swift`, `VerifyGoalView.swift`) as closely as the
platform allows — see "Where this can't be a literal port" below for the one real gap.

## Scope

Two independent flows, same underlying mechanic (watch N rewarded ads, in exchange for something):

1. **Release a held stake** — a goal that's Failed and still `stakeStatus == "held"` (missed its
   deadline, but `process-expired-goals`'s 24h grace hasn't captured it yet). Watching enough ads
   releases the hold instead of letting it get charged. Only applies to `held` goals.
2. **Self-confirm a gated goal** — the goal's own owner, opening their own share link, watches
   enough ads to mark it done anyway instead of waiting for a friend. Only ever reachable when
   `ownsGoalWithVerificationCode` is true for the signed-in user (see below).

Staking is the primary mechanism in both cases; ads are a pure bonus escape hatch, not a required
path — if no ad is available, the answer is just "check back later," no other fallback needed.

## Ad count: 20 for both, on web

Explicit product decision, diverging from iOS (which uses 2 for release, 10 for verification
bypass in production). No need to force parity across platforms — each platform's constant lives
independently (`TaskStore.adsRequiredForRelease`/`adsRequiredForVerificationBypass` on iOS, a new
`adsConfig.ts` on web). If iOS's numbers change later, web's don't need to follow, and vice versa.

## Ad network: Google's Ad Placement API (not AdMob — AdMob is mobile-only)

AdMob's Rewarded Ad SDK (`GoogleMobileAds`, what iOS uses) has no browser equivalent. The actual
closest counterpart for a plain web page is Google's **Ad Placement API**
(`adsbygoogle.js`'s `type: 'reward'` placement — the same product HTML5 game sites use for
rewarded video). Rough shape (verify exact callback names against Google's current docs when
implementing — this is written from general knowledge, not a tested integration):

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"></script>
```

```js
window.adsbygoogle = window.adsbygoogle || [];
adsbygoogle.push({
  type: 'reward',
  name: 'release-stake', // or 'verification-bypass' — distinct placement names per flow
  beforeReward: (showAdFn) => showAdFn(),
  adViewed: () => { /* earned — same meaning as AdReleaseCoordinator's onEarnedReward */ },
  adDismissed: () => { /* closed early, no reward — onDismissedWithoutReward */ },
  adBreakDone: (placementInfo) => {
    // placementInfo.breakStatus covers the "couldn't even show one" cases — onNoAdAvailable
  },
});
```

**Required manual setup** (same category as the CloudKit/Stripe dashboard steps already in
`README.md` — none of this can be scripted):
1. A Google AdSense account approved for `mymaingoals.app`.
2. A rewarded ad unit ("reward" format) created for the site.
3. The publisher `client` id wired into a new `adsConfig.ts` (mirrors `AdsConfig.swift`'s
   `rewardedAdUnitID`, dev vs prod split via `import.meta.env.DEV` mirroring iOS's `#if DEBUG`).

**Real risk, bigger than on iOS**: fill rate. iOS's own plan doc already flags AdMob fill as the
limiting factor even there; Google's web rewarded-ad inventory skews heavily toward game portals,
so a small non-game utility site may see "no ad available" often, maybe most of the time, for real
users. Per your call above: when that happens, just show "No ad available right now — check back
later" (mirrors iOS's own `onNoAdAvailable` wording) and let them retry whenever. No additional
fallback path needed — this is explicitly a bonus, not a required flow.

## Where this can't be a literal port (and why it doesn't matter)

iOS's verification-bypass write (`TaskStore.recordVerificationBypassAdWatched`) is framed as
"local-only, never touches the server's is_verified" — but that's just because it's an ordinary
SwiftData `save()`, and this app's SwiftData store has `cloudKitDatabase: .automatic`, so that
local write gets pushed to the same `CD_isVerified` CloudKit field in the background regardless.
The end state is identical either way — a real, cross-device-visible `isVerified = true`. Web has
no local store to write through in the first place (`ownsGoalWithVerificationCode` is already a
live CloudKit query), so calling `markGoalVerified` (already exists in `cloudkit.ts`) directly
isn't a shortcut around anything — it's the same destination iOS reaches by a longer path that
only exists there because *all* of TaskStore's writes go through SwiftData first.

## Data model: no schema changes needed

`CD_adsWatchedForRelease`/`CD_adsWatchedForVerificationBypass` already exist as CloudKit fields
(`GOAL_FIELDS` in `cloudkitConfig.ts`), already initialized to 0 in `createGoal` — just unused by
the web client so far. `Goal`/`mapRecord` in `useGoals.ts` need the two fields added (currently
absent — check before assuming they're already mapped).

## Build order

1. **`adsConfig.ts`**: `ADS_REQUIRED_FOR_RELEASE = 20`, `ADS_REQUIRED_FOR_VERIFICATION_BYPASS = 20`,
   the AdSense publisher/ad-unit ids (dev vs prod via `import.meta.env.DEV`, once a real account
   exists — until then, code against a mock).
2. **`useGoals.ts`**: add `adsWatchedForRelease`/`adsWatchedForVerificationBypass` to the `Goal`
   interface and `mapRecord`.
3. **`cloudkit.ts`**: add `recordAdWatchedForRelease(container, goal)` and
   `recordAdWatchedForVerificationBypass(container, goal)` — same shape as `saveGoalFields`,
   increment the counter field by 1. Change `ownsGoalWithVerificationCode` to return the matching
   `Goal | null` (via `mapRecord`) instead of a bare `boolean`, so callers have something to read
   the counter from and eventually write to — this is the one existing-code change needed, not
   purely additive.
4. **`useRewardedAd.ts`**: new hook wrapping the Ad Placement API push/callback dance, mirroring
   `AdReleaseCoordinator`'s three outcomes (`onEarnedReward`, `onDismissedWithoutReward`,
   `onNoAdAvailable`) and its `isReady`/preload behavior as closely as the API allows (the Ad
   Placement API may not have an explicit "preload" concept the way `GADRewardedAd.load` does —
   confirm during implementation, adjust the "Loading…" state accordingly if not).
5. **App.tsx wiring for the release flow**: on watching enough ads, call the existing
   `releaseHold` (`staking.ts`) then `updateGoalStakeStatus` (`cloudkit.ts`) — same two calls
   `handleToggleDone`'s staked-completion path already makes, just triggered from ad-watching
   instead of marking done. Apply the same `applyGoalOverride` optimistic-update pattern used
   everywhere else in this app, so the release doesn't wait on CloudKit's query-index lag either.
6. **`FailedTab.tsx`**: add an ad-release section for `stakeStatus === 'held'` goals — progress
   text ("Watch N more ads to avoid the charge"), a "Watch Ad · x/20" button with
   loading/ready/watching/no-ad states, mirrors `FailedTaskRow.adReleaseSection` /
   `releasePendingSection`.
7. **`VerifyModal.tsx`**: once `ownsGoalWithVerificationCode` returns the actual `Goal`, add the
   self-confirm-bypass section (mirrors `VerifyGoalView.selfConfirmBypassSection`) — "This is your
   own goal — a friend needs to confirm it" + "Or watch N more ads to unlock Done anyway" + the
   same Watch Ad button, calling `recordAdWatchedForVerificationBypass` and then `markGoalVerified`
   at threshold.
8. Test end-to-end once the AdSense account/ad unit exist — until then, steps 2–7 can be built and
   reviewed against a mocked `useRewardedAd` that always reports "no ad available," so the rest of
   the flow (counters, thresholds, release/bypass calls) is provably correct independent of the ad
   network actually working.

## Explicitly out of scope

Personalized/targeted ads (matches iOS's non-personalized-only choice), any change to the 24h
capture grace window, partial credit for a skipped/incomplete ad, forcing web's ad count to match
iOS's.
