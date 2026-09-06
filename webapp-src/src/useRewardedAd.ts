import { useCallback, useEffect, useState } from 'react';
import { ADSENSE_CLIENT_ID, adMode } from './adsConfig';

/// Mirrors the three outcomes AdReleaseCoordinator.watch reports on iOS — these are
/// genuinely different failures with different messaging, not one "didn't finish" case:
/// `dismissed` means an ad played and was closed early (no credit), `no-ad` means none could
/// be shown at all.
export type AdOutcome = 'earned' | 'dismissed' | 'no-ad';

/// Mirrors AdReleaseCoordinator.isReady plus the `isPreloadingFirstAd` flag its call sites
/// keep alongside it — one enum here since the two are never independently meaningful.
export type AdStatus = 'preloading' | 'ready' | 'unavailable';

/// The subset of the Ad Placement API this app pushes onto the `adsbygoogle` queue: the
/// one-time `adConfig` call, and a rewarded `adBreak` per watch.
type AdConfigCommand = { preloadAdBreaks?: 'on' | 'auto'; sound?: 'on' | 'off'; onReady?: () => void };
type AdBreakCommand = {
  type: 'reward';
  name: string;
  /// Only called when an ad is actually available — calling the passed function is what
  /// shows it. If no ad can be shown, this never runs and only adBreakDone does.
  beforeReward: (showAdFn: () => void) => void;
  adViewed: () => void;
  adDismissed: () => void;
  adBreakDone: (placementInfo: { breakStatus?: string }) => void;
};

declare global {
  interface Window {
    adsbygoogle?: Array<AdConfigCommand | AdBreakCommand>;
  }
}

/// Injected on first use rather than sitting in index.html, so a build with no publisher id
/// yet (see adsConfig.adMode) never issues an ad request, and neither does a session that
/// never opens a flow with ads in it. Resolves once the Ad Placement API reports itself
/// ready; rejects if the script can't load at all (an ad blocker is the common case, and
/// there's no error callback for that — hence the timeout).
let sdkPromise: Promise<void> | null = null;
let scriptAppended = false;
const SDK_READY_TIMEOUT_MS = 10_000;

function loadAdPlacementApi(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // A slow connection, not necessarily a dead one — drop the cached rejection so that
      // tapping "No Ad — Retry" genuinely waits again rather than failing instantly. The
      // script tag isn't re-added (see scriptAppended); the retry just re-pushes adConfig,
      // and the queue is processed in order whenever the SDK does arrive.
      sdkPromise = null;
      reject(new Error('Ad script never became ready'));
    }, SDK_READY_TIMEOUT_MS);

    window.adsbygoogle = window.adsbygoogle || [];
    // `preloadAdBreaks: 'on'` is this API's closest thing to GADRewardedAd.load — there's
    // no explicit per-ad preload call to mirror AdReleaseCoordinator.preload, so "ready"
    // here means the SDK is up and preloading, not that a specific ad object is in hand.
    window.adsbygoogle.push({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => {
        clearTimeout(timer);
        resolve();
      },
    });

    if (scriptAppended) return;
    scriptAppended = true;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.dataset.adFrequencyHint = '30s';
    // Same intent as iOS's Debug-only test ad unit: never generate real ad traffic against
    // the AdSense account from repeated dev-build watches.
    if (import.meta.env.DEV) script.dataset.adbreakTest = 'on';
    // Unlike the timeout above, this rejection is *kept* cached: an ad blocker (much the
    // likeliest cause) won't stop blocking on a retry, so failing fast is the honest answer.
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Ad script failed to load'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/// adBreakDone is documented to always fire, but a promise that never settles would leave
/// the Watch Ad button spinning with no way out — this is a pure safety net, well past any
/// real rewarded ad's length.
const AD_BREAK_TIMEOUT_MS = 5 * 60_000;

function showRewardedAd(placementName: string): Promise<AdOutcome> {
  return new Promise<AdOutcome>((resolve) => {
    // Default to 'no-ad': adBreakDone fires for every outcome including "couldn't show one",
    // and adViewed/adDismissed are what upgrade it to a real watch result beforehand.
    let outcome: AdOutcome = 'no-ad';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(finish, AD_BREAK_TIMEOUT_MS);

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({
      type: 'reward',
      name: placementName,
      beforeReward: (showAdFn) => showAdFn(),
      adViewed: () => {
        outcome = 'earned';
      },
      adDismissed: () => {
        outcome = 'dismissed';
      },
      adBreakDone: finish,
    });
  });
}

/// Web counterpart of AdReleaseCoordinator — one rewarded-ad placement, watched repeatedly.
/// `enabled` gates the SDK load the same way iOS's `.task { guard ... }` gates preload(),
/// so a row/sheet that has no ads to offer never loads the ad script at all.
export function useRewardedAd(placementName: string, enabled: boolean): { status: AdStatus; watch: () => Promise<AdOutcome> } {
  const mode = adMode();
  const [status, setStatus] = useState<AdStatus>(mode === 'live' ? 'preloading' : mode === 'simulated' ? 'ready' : 'unavailable');

  useEffect(() => {
    if (!enabled || mode !== 'live') return;
    let cancelled = false;
    setStatus('preloading');
    loadAdPlacementApi().then(
      () => {
        if (!cancelled) setStatus('ready');
      },
      () => {
        // Ad blocker, network failure, or a publisher id the network rejects — all of which
        // are "no ad available", the same non-error outcome as an unfilled request.
        if (!cancelled) setStatus('unavailable');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, mode]);

  const watch = useCallback(async (): Promise<AdOutcome> => {
    if (mode === 'unavailable') return 'no-ad';
    if (mode === 'simulated') {
      return window.confirm(
        '[dev] Simulated rewarded ad — no AdSense publisher id configured yet.\n\n' +
          'OK = watched to the end (counts toward the total).\n' +
          "Cancel = closed early (doesn't count)."
      )
        ? 'earned'
        : 'dismissed';
    }
    try {
      await loadAdPlacementApi();
      // A retry that got further than the initial attempt did (the timeout path above resets
      // itself) — otherwise the button would keep reading "No Ad — Retry" while working fine.
      setStatus('ready');
    } catch {
      setStatus('unavailable');
      return 'no-ad';
    }
    return showRewardedAd(placementName);
  }, [mode, placementName]);

  return { status, watch };
}
