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
