import type { ReactNode } from 'react';

/// iOS's secondary label color, for a row's date line (`.foregroundStyle(.secondary)` in the app).
export function Secondary({ children }: { children: ReactNode }) {
  return <span className="text-ios-secondary dark:text-ios-secondary-dark">{children}</span>;
}
