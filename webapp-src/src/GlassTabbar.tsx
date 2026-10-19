import type { ReactNode } from 'react';
import { Badge, Glass } from 'konsta/react';

export interface GlassTabbarItem {
  id: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

/// A floating, rounded "Liquid Glass" tab bar, matching iOS 26's redesigned tab bar shape —
/// Konsta's own <Tabbar>/<TabbarLink> render the *previous*-generation edge-to-edge bar (see
/// ToolbarClasses.js: a full-width gradient background, not an inset rounded pill), and don't
/// expose a floating-glass variant. Konsta does ship the glass *material* itself as a
/// standalone <Glass> primitive (translucent blur + iOS's hover-highlight), so this composes
/// that with plain buttons instead — same visual language, just not Konsta's bar shape.
///
/// Icon above label, stacked — same as real iOS tab bars, never side by side. The active
/// highlight still ends up a horizontal pill (`rounded-full`), not a circle, because each tab's
/// box fills its full-width segment, which is wider than it is tall.
export function GlassTabbar({ items }: { items: GlassTabbarItem[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 mx-auto flex max-w-(--k-app-max-w) justify-center px-4">
      {/* highlight={false}: Konsta's iOS "liquid glass" hover-highlight (use-ios-highlight.js)
          creates a new translucent overlay span on the Glass element on every pointerenter
          without checking whether a previous one is still there mid-removal — tapping Goals/
          Done back and forth as fast as possible fires pointerenter faster than each overlay
          finishes fading out, so they pile up and the stacked translucent white circles read as
          the icon/label fading to white/invisible. Not something we need on a nav bar (it's
          meant for pointer-hover feedback on larger surfaces), so just turn it off here. */}
      <Glass highlight={false} className="pointer-events-auto flex w-full items-stretch gap-1 rounded-full p-1.5">
        {items.map((item) => (
          <button key={item.id} onClick={item.onClick} className="flex flex-1 items-center justify-center">
            <span
              // Full-width segments, like iOS 26's tab bar: the bar spans the screen and each
              // tab's highlight fills its share of it.
              className={`flex w-full flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium ${
                item.active ? 'bg-primary/15 text-primary' : 'text-black/60 dark:text-white/60'
              }`}
            >
              <span className="relative inline-flex">
                {item.icon}
                {item.badge != null && item.badge > 0 && <Badge small className="absolute -right-1.5 -top-1">{item.badge}</Badge>}
              </span>
              {item.label}
            </span>
          </button>
        ))}
      </Glass>
    </div>
  );
}
