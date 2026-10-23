// Gift links: https://mymaingoals.app/webapp/?gift=<code>. The code is a RevenueCat Web
// Billing discount code, 100% off the lifetime plan (the "friend_gift" discount; codes come
// from the backend repo's scripts/gift-link.py). Nothing of ours checks or stores it: the
// checkout applies it, and RevenueCat refuses an unknown or deleted code.

const PARAM = 'gift';

export function giftCodeFromURL(): string | null {
  const code = new URLSearchParams(window.location.search).get(PARAM)?.trim();
  return code && /^[A-Za-z0-9_]+$/.test(code) ? code : null;
}

/// Once redeemed, so a reload doesn't offer it again.
export function clearGiftCodeFromURL() {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, '', url);
}
