// Small hand-drawn stand-ins for the SF Symbols used on iOS (checklist, checkmark.circle,
// xmark.circle, plus) — Konsta doesn't bundle an icon set, and pulling in a whole icon
// library for four glyphs isn't worth the dependency.
import type { SVGProps } from 'react';

function svg(children: React.ReactNode, props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export function ChecklistIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <path d="M4 6h2m3 0h11" />
      <path d="M4 12h2m3 0h11" />
      <path d="M4 18h2m3 0h11" />
    </>,
    props
  );
}

export function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>,
    props
  );
}

export function XCircleIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>,
    props
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return svg(<path d="M12 5v14M5 12h14" />, props);
}

export function XMarkIcon(props: SVGProps<SVGSVGElement>) {
  return svg(<path d="m6 6 12 12M18 6 6 18" />, props);
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>,
    props
  );
}

export function CircleIcon(props: SVGProps<SVGSVGElement>) {
  return svg(<circle cx="12" cy="12" r="9" />, props);
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>,
    props
  );
}

export function IphoneIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>,
    props
  );
}

/// The "opens outside" arrow, like SF Symbols' arrow.up.forward.
export function ArrowUpForwardIcon(props: SVGProps<SVGSVGElement>) {
  return svg(<path d="M8 16 16 8M9 8h7v7" />, props);
}

export function EnvelopeIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>,
    props
  );
}

export function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>,
    props
  );
}

// The intro's row icons, after SF Symbols target, clock, person.2 and dollarsign.circle.
export function TargetIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>,
    props
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5H8.5" />
    </>,
    props
  );
}

export function PeopleIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="8.5" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
      <path d="M16.5 13.5c3 0 5 2.2 5 5.5h-4" />
    </>,
    props
  );
}

export function DollarCircleIcon(props: SVGProps<SVGSVGElement>) {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2c-.4-1-1.5-1.7-2.8-1.7-1.6 0-2.8.9-2.8 2.2 0 3 5.8 1.6 5.8 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.7-3-1.8M12 6v1.5m0 9V18" />
    </>,
    props
  );
}
