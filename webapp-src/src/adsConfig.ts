// Web counterpart of MyMainGoals/Ads/AdsConfig.swift + TaskStore.adsRequiredForRelease /
// TaskStore.adsRequiredForVerificationBypass. Deliberately *not* forced to match iOS's
// numbers — each platform's constants are independent (see ADS_RELEASE_PLAN.md), so
// changing one of these never implies a change on the other side.

/// Ads to watch to release a held stake instead of letting it be charged. iOS uses 2;
/// web uses 20 by product decision.
export const ADS_REQUIRED_FOR_RELEASE = 20;

/// Ads for the goal owner's own "unlock Done without a friend" escape hatch. Same idea as
/// iOS's much-higher-than-release count: a genuine alternative cost, not a quick way around
/// actually requiring a friend.
export const ADS_REQUIRED_FOR_VERIFICATION_BYPASS = 20;

/// AdMob (what iOS uses) has no browser equivalent — the closest counterpart for a plain web
/// page is Google's Ad Placement API (`adsbygoogle.js` with `type: 'reward'`), which is
/// keyed by an AdSense publisher id rather than a per-unit ad id.
///
/// Same publisher account as AdMob/iOS, confirmed against the AdSense dashboard: the number
/// here matches `AdsConfig.rewardedAdUnitID`'s `ca-app-pub-4389491745714720` prefix and the
/// repo root's `app-ads.txt`/`ads.txt`. Safe to embed client-side — it's a public identifier
/// that appears in the ad script's own URL on every page that serves ads.
export const ADSENSE_CLIENT_ID = 'ca-pub-4389491745714720';

/// The Ad Placement API identifies each rewarded placement by name (there's no ad-unit id to
/// pass), so the two flows get distinct names and can be reported on separately.
export const AD_PLACEMENTS = {
  release: 'release-stake',
  verificationBypass: 'verification-bypass',
} as const;

export type AdMode = 'live' | 'simulated' | 'unavailable';

/// Mirrors AdsConfig.swift's `#if DEBUG` split, with one extra state web needs and iOS
/// doesn't: iOS always has *some* usable ad unit (Google's public test one in Debug), but
/// web has no publisher id at all until an AdSense account exists.
///
/// - `live`: real Ad Placement API requests. Dev builds still add `data-adbreak-test` (see
///   useRewardedAd.ts) so repeated dev watches can't flag the real account for invalid
///   traffic — same reasoning as iOS using the test ad unit in Debug.
/// - `simulated`: dev with no publisher id yet — a confirm() dialog stands in for the ad so
///   the counters/threshold/release flow is exercisable end-to-end without the ad network.
/// - `unavailable`: a production build with no publisher id. Reports "no ad available",
///   which is a real, already-handled outcome (ads are a bonus escape hatch, never a
///   required path), not an error state.
export function adMode(): AdMode {
  if (!ADSENSE_CLIENT_ID.startsWith('REPLACE_')) return 'live';
  return import.meta.env.DEV ? 'simulated' : 'unavailable';
}
