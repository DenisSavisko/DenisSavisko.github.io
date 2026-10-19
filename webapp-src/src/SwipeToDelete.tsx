import { useRef, useState, type ReactNode } from 'react';

const ACTION_WIDTH = 80; // the revealed Delete button, about iOS's width
const FULL_SWIPE = 0.6; // letting go past this share of the row's width deletes right away

/// iOS's swipe-to-delete for a list row: swipe left to reveal a red Delete button, or swipe
/// most of the way across to delete at once. Wraps one Konsta ListItem rendered with
/// component="div" (this is the <li>). Self-contained, so swapping it out later only means
/// going back to a visible delete button where it's used.
export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; from: number; horizontal: boolean | null } | null>(null);
  // A swipe, or a tap that just closes an open row, must not also click whatever's under it.
  const swallowClick = useRef(false);

  function remove() {
    setOffset(0);
    onDelete();
  }

  return (
    <li
      ref={rowRef}
      className="relative overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, from: offset, horizontal: null };
        swallowClick.current = offset !== 0;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.horizontal === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          d.horizontal = Math.abs(dx) > Math.abs(dy);
          if (!d.horizontal) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          swallowClick.current = true;
        }
        if (d.horizontal) setOffset(Math.min(0, d.from + dx));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.horizontal) {
          if (offset !== 0) setOffset(0);
          return;
        }
        setDragging(false);
        const width = rowRef.current?.offsetWidth ?? 0;
        if (-offset > width * FULL_SWIPE) remove();
        else setOffset(-offset > ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setOffset(0);
      }}
      onClickCapture={(e) => {
        if (!swallowClick.current || buttonRef.current?.contains(e.target as Node)) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {offset < 0 && (
        <button
          ref={buttonRef}
          onClick={remove}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 font-medium text-white"
          style={{ width: -offset }}
        >
          Delete
        </button>
      )}
      <div
        className={dragging ? undefined : 'transition-transform duration-200 ease-out'}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </li>
  );
}
