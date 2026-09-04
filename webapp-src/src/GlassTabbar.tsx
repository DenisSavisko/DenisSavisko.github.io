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
/// highlight still ends up a horizontal pill (`rounded-full`), not a circle: that comes from
/// giving the box more horizontal padding than vertical (px-6 vs py-1.5) so the final wrapped
/// box is wider than it is tall, not from changing how icon/label are laid out inside it.
export function GlassTabbar({ items }: { items: GlassTabbarItem[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 mx-auto flex max-w-(--k-app-max-w) justify-center px-6">
      <Glass className="pointer-events-auto flex items-stretch gap-1 rounded-full p-1.5">
        {items.map((item) => (
          <button key={item.id} onClick={item.onClick} className="flex flex-1 items-center justify-center">
            <span
              className={`flex flex-col items-center gap-0.5 rounded-full px-6 py-1.5 text-[11px] font-medium transition-colors ${
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
