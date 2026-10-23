// While a sheet or dialog is open, the page behind it stays put. The page scroller gets
// overflow hidden, and on touch screens a swipe anywhere outside content that can itself
// scroll is swallowed, so it can't reach the page (or rubber-band the whole window).
import { useEffect, type RefObject } from 'react';

export function useScrollLock(locked: boolean, pageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const page = pageRef.current;
    if (!locked || !page) return;
    const root = document.documentElement;
    const previousOverflow = page.style.overflow;
    const previousOverscroll = root.style.overscrollBehavior;
    page.style.overflow = 'hidden';
    // iPhone Safari otherwise bounces the whole window under a swipe on the sheet.
    root.style.overscrollBehavior = 'none';

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startY;
      const scroller = scrollableAncestor(e.target as Element | null);
      const canScroll = scroller && (dy > 0 ? scroller.scrollTop > 0 : scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
      if (!canScroll) e.preventDefault();
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      page.style.overflow = previousOverflow;
      root.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [locked, pageRef]);
}

/// The nearest element with content to scroll, other than the locked page itself.
function scrollableAncestor(target: Element | null): HTMLElement | null {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) continue;
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}
