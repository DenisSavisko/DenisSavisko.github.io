// Konsta's Sheet, plus what an iOS sheet does that it doesn't: a swipe never scrolls the page
// behind it, and dragging it down closes it.
import { useEffect, useRef, type ComponentProps } from 'react';
import { Sheet } from 'konsta/react';

// Past this much of the sheet's height, or a quick flick, a drag closes it.
const CLOSE_FRACTION = 0.25;
const CLOSE_VELOCITY = 0.5; // px per ms
const CLOSE_MS = 250;

type SwipeSheetProps = Omit<ComponentProps<typeof Sheet>, 'onBackdropClick'> & { onClose: () => void };

export function SwipeSheet({ onClose, opened, ...props }: SwipeSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Read at the end of a drag, so the listeners below don't need re-adding when it changes.
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet || !opened) return;
    // Konsta renders the backdrop right before the sheet.
    const backdrop = sheet.previousElementSibling as HTMLElement | null;

    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let offset = 0;
    let isDragging = false;
    let scroller: HTMLElement | null = null;

    function onTouchStart(e: TouchEvent) {
      startY = lastY = e.touches[0].clientY;
      lastTime = e.timeStamp;
      velocity = 0;
      offset = 0;
      isDragging = false;
      scroller = scrollableAncestor(e.target as Element, sheet!);
    }

    function onTouchMove(e: TouchEvent) {
      const y = e.touches[0].clientY;
      velocity = (y - lastY) / Math.max(1, e.timeStamp - lastTime);
      lastY = y;
      lastTime = e.timeStamp;
      const dy = y - startY;
      // Content that can still scroll this way scrolls; at its top, pulling down drags.
      if (!isDragging && scroller && (dy < 0 ? canScrollDown(scroller) : scroller.scrollTop > 0)) return;
      e.preventDefault();
      if (!isDragging && dy > 0) isDragging = true;
      if (!isDragging) return;
      offset = Math.max(0, dy);
      sheet!.style.transition = 'none';
      sheet!.style.transform = `translateY(calc(-100% + ${offset}px))`;
      if (backdrop) backdrop.style.opacity = String(1 - offset / sheet!.offsetHeight);
    }

    function onTouchEnd() {
      if (!isDragging) return;
      isDragging = false;
      const closes = offset > sheet!.offsetHeight * CLOSE_FRACTION || velocity > CLOSE_VELOCITY;
      sheet!.style.transition = `transform ${CLOSE_MS}ms ease-out`;
      sheet!.style.transform = closes ? 'translateY(0)' : '';
      if (backdrop) {
        backdrop.style.transition = `opacity ${CLOSE_MS}ms ease-out`;
        backdrop.style.opacity = closes ? '0' : '';
      }
      if (!closes) return;
      setTimeout(() => {
        latestOnClose.current();
        // Back to Konsta's classes once closed, ready for the next open.
        for (const el of [sheet!, backdrop]) {
          el?.style.removeProperty('transition');
          el?.style.removeProperty('transform');
          el?.style.removeProperty('opacity');
        }
      }, CLOSE_MS);
    }

    // The backdrop never scrolls anything either.
    function blockScroll(e: Event) {
      e.preventDefault();
    }

    function onWheel(e: WheelEvent) {
      const target = scrollableAncestor(e.target as Element, sheet!);
      if (!target || !(e.deltaY < 0 ? target.scrollTop > 0 : canScrollDown(target))) e.preventDefault();
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);
    sheet.addEventListener('wheel', onWheel, { passive: false });
    backdrop?.addEventListener('touchmove', blockScroll, { passive: false });
    backdrop?.addEventListener('wheel', blockScroll, { passive: false });
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchEnd);
      sheet.removeEventListener('wheel', onWheel);
      backdrop?.removeEventListener('touchmove', blockScroll);
      backdrop?.removeEventListener('wheel', blockScroll);
    };
  }, [opened]);

  return <Sheet ref={ref} opened={opened} onBackdropClick={onClose} {...props} />;
}

/// The nearest element between `target` and the sheet that actually has content to scroll.
function scrollableAncestor(target: Element, sheet: HTMLElement): HTMLElement | null {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) continue;
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

function canScrollDown(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}
