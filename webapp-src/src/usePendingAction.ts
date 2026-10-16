import { useCallback, useEffect, useRef, useState } from 'react';

/// Mirrors PendingAction on iOS — "do X after a short delay, tap to cancel," used for
/// optimistic mark-done and delete so there's a brief window to change your mind before the
/// write actually fires.
///
/// Leaving the page commits anything still pending right away: iOS Safari freezes a
/// background tab's timers, so otherwise the write would sit unsent until the user came back
/// (or be lost if the tab got discarded). Undo can't be tapped on a hidden page anyway.
export function usePendingAction(delayMs = 2000) {
  const [startTimes, setStartTimes] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const performs = useRef<Record<string, () => void | Promise<void>>>({});

  useEffect(() => {
    function commitAllIfHidden() {
      if (document.visibilityState !== 'hidden') return;
      const pending = Object.keys(timers.current);
      if (pending.length === 0) return;
      for (const id of pending) {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        const perform = performs.current[id];
        delete performs.current[id];
        if (perform) void perform();
      }
      setStartTimes({});
    }
    document.addEventListener('visibilitychange', commitAllIfHidden);
    return () => document.removeEventListener('visibilitychange', commitAllIfHidden);
  }, []);

  const isPending = useCallback((id: string) => startTimes[id] !== undefined, [startTimes]);
  const startedAt = useCallback((id: string) => startTimes[id], [startTimes]);

  const cancel = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    delete performs.current[id];
    setStartTimes((prev) => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const start = useCallback(
    (id: string, perform: () => void | Promise<void>) => {
      // Same guard as iOS's PendingAction.start: a second start must not leave two timers.
      if (timers.current[id] !== undefined) return;
      setStartTimes((prev) => {
        if (prev[id] !== undefined) return prev;
        return { ...prev, [id]: Date.now() };
      });
      performs.current[id] = perform;
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        delete performs.current[id];
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
