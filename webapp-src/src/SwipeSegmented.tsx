// Konsta's Segmented, plus what its tab bar already does: sliding a finger across it
// selects whichever option is under the finger. Taps work as before.
import { Segmented, SegmentedButton } from 'konsta/react';

type Option<Id extends string> = { id: Id; label: string };

export function SwipeSegmented<Id extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  function selectAt(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Past either end still means the first or last option.
    const x = Math.min(Math.max(e.clientX, rect.left + 1), rect.right - 1);
    const button = document.elementFromPoint(x, rect.top + rect.height / 2)?.closest('[data-option]');
    const id = button?.getAttribute('data-option') as Id | undefined;
    if (id && id !== value) onChange(id);
  }

  return (
    <div
      // Vertical swipes still scroll; horizontal ones belong to the control.
      className="touch-pan-y"
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) selectAt(e);
      }}
    >
      <Segmented strong rounded>
        {options.map((option) => (
          <SegmentedButton key={option.id} data-option={option.id} active={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </SegmentedButton>
        ))}
      </Segmented>
    </div>
  );
}
