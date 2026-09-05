import { useEffect, useState } from 'react';

/// Every Tailwind `dark:` class in this app — both hand-written ones and Konsta's own (see
/// node_modules/konsta/shared/colors/*.js, e.g. `bg-ios-light-surface dark:bg-ios-dark-surface`)
/// — compiles to a `.dark` ancestor-class selector, not a `prefers-color-scheme` media query
/// (confirmed against the actual build output — grepping for "prefers-color-scheme" in
/// webapp/assets/*.css comes back empty, "\.dark" doesn't). So following the system's light/dark
/// setting means toggling that class ourselves. Separately, Konsta's own components only ever
/// emit their internal `dark:`-prefixed classes at all when the `dark` prop passed to `<App>` is
/// true (see use-dark-classes.js's `useDarkClasses` — it returns '' outright otherwise) — so the
/// boolean this hook returns also has to be threaded into `<KonstaApp dark={...}>` for Konsta's
/// own primitives to follow along, not just the classes we've written ourselves.
export function useSystemDarkMode(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [isDark, setIsDark] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return isDark;
}
