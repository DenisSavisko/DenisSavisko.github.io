import { useCallback, useRef, useState } from 'react';

/// Mirrors PendingAction on iOS — "do X after a short delay, tap to cancel," used for
/// optimistic mark-done and delete so there's a brief window to change your mind before the
/// write actually fires.
export function usePendingAction(delayMs = 2000) {
  const [startTimes, setStartTimes] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isPending = useCallback((id: string) => startTimes[id] !== undefined, [startTimes]);
  const startedAt = useCallback((id: string) => startTimes[id], [startTimes]);

  const cancel = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setStartTimes((prev) => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const start = useCallback(
    (id: string, perform: () => void | Promise<void>) => {
      setStartTimes((prev) => {
        if (prev[id] !== undefined) return prev;
        return { ...prev, [id]: Date.now() };
      });
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        setStartTimes((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        void perform();
      }, delayMs);
    },
    [delayMs]
  );

  /// Starts if not already pending, cancels if it is — for controls where the same tap
  /// gesture both triggers and undoes the action (e.g. the mark-done circle).
  const toggle = useCallback(
    (id: string, perform: () => void | Promise<void>) => {
      if (startTimes[id] !== undefined) cancel(id);
      else start(id, perform);
    },
    [startTimes, cancel, start]
  );

  return { isPending, startedAt, start, cancel, toggle, delayMs };
}
