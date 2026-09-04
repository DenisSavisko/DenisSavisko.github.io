import { ListItem } from 'konsta/react';
import { TrashIcon } from './icons';

/// Mirrors PendingDeleteRow on iOS — tap anywhere to undo before the countdown finishes and
/// it's actually deleted. `startedAt` (a timestamp) is used as the countdown bar's key so a
/// fresh pending action restarts the animation from full.
export function PendingDeleteRow({ title, startedAt, delayMs, onUndo }: { title: string; startedAt: number; delayMs: number; onUndo: () => void }) {
  return (
    <ListItem
      link
      chevron={false}
      onClick={onUndo}
      media={<TrashIcon className="h-5 w-5 text-ios-secondary dark:text-ios-secondary-dark" />}
      title={<span className="text-ios-secondary line-through dark:text-ios-secondary-dark">{title}</span>}
      after={<span className="text-sm font-semibold">Undo</span>}
      footer={
        <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            key={startedAt}
            className="pending-countdown-bar h-full w-full bg-black/40 dark:bg-white/40"
            style={{ '--pending-delay': `${delayMs}ms` } as React.CSSProperties}
          />
        </div>
      }
    />
  );
}
