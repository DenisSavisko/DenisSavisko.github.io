// The signed-out screen for new visitors: what the app is about, in the same words as the
// iPhone app's intro (IntroView.swift), plus the one line only the web can say. Sign in with
// Apple, pinned to the bottom of the page, is the button that follows it.
import type { ComponentType, SVGProps } from 'react';
import { ClockIcon, DollarCircleIcon, PeopleIcon, TargetIcon } from './icons';

const ROWS: Array<{ Icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; detail: string }> = [
  { Icon: TargetIcon, title: "Three goals. That's it.", detail: 'Focus on what matters most.' },
  { Icon: ClockIcon, title: 'Every goal has a deadline.', detail: 'Finish in time, or it counts as failed.' },
  { Icon: PeopleIcon, title: 'Get a friend to confirm.', detail: "It's done when they say it is." },
  { Icon: DollarCircleIcon, title: 'Put money on it.', detail: 'Stake money for extra motivation.' },
];

export function Intro() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-7 px-8 pt-8 pb-40">
      {ROWS.map(({ Icon, title, detail }) => (
        <div key={title} className="flex items-start gap-4">
          <Icon className="h-9 w-9 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-black/55 dark:text-white/55">{detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
