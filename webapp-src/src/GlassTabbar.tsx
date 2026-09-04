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
/// `rounded-full` is the same shape on both the outer bar and the active-tab highlight, same
/// as real iOS — it just reads differently at each size: on the wide outer bar it's a capsule
/// (straight top/bottom, round ends), on the small icon-sized highlight it's a plain circle.
/// That's why the highlight only wraps the icon, not the whole icon+label block — full-round
/// on a tall icon-over-label rectangle doesn't shrink to a capsule, it just looks like a
/// stretched blob.
export function GlassTabbar({ items }: { items: GlassTabbarItem[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 mx-auto flex max-w-(--k-app-max-w) justify-center px-6">
      <Glass className="pointer-events-auto flex items-stretch gap-1 rounded-full p-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-full px-5 py-2 text-[11px] font-medium transition-colors ${
              item.active ? 'text-primary' : 'text-black/60 dark:text-white/60'
            }`}
          >
            <span className={`relative inline-flex rounded-full p-1.5 transition-colors ${item.active ? 'bg-primary/15' : ''}`}>
              {item.icon}
              {item.badge != null && item.badge > 0 && <Badge small className="absolute -right-1.5 -top-0.5">{item.badge}</Badge>}
            </span>
            {item.label}
          </button>
        ))}
      </Glass>
    </div>
  );
}
