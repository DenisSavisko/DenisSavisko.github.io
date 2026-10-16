import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingAction } from './usePendingAction';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePendingAction', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('performs after the delay and stops being pending', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => result.current.start('a', perform));
    expect(result.current.isPending('a')).toBe(true);

    act(() => vi.advanceTimersByTime(1999));
    expect(perform).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(perform).toHaveBeenCalledTimes(1);
    expect(result.current.isPending('a')).toBe(false);
  });

  it('never performs once cancelled', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => result.current.start('a', perform));
    act(() => result.current.cancel('a'));
    act(() => vi.advanceTimersByTime(5000));
    expect(perform).not.toHaveBeenCalled();
    expect(result.current.isPending('a')).toBe(false);
  });

  it('toggle undoes a pending action', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => result.current.toggle('a', perform));
    act(() => result.current.toggle('a', perform));
    act(() => vi.advanceTimersByTime(5000));
    expect(perform).not.toHaveBeenCalled();
  });

  it('a second start while pending does not perform twice', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => {
      result.current.start('a', perform);
      result.current.start('a', perform);
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('commits right away when the page is hidden, and only once', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => result.current.start('a', perform));

    act(() => setVisibility('hidden'));
    expect(perform).toHaveBeenCalledTimes(1);
    expect(result.current.isPending('a')).toBe(false);

    act(() => vi.advanceTimersByTime(5000));
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('does not commit a cancelled action when the page is hidden', () => {
    const { result } = renderHook(() => usePendingAction(2000));
    const perform = vi.fn();
    act(() => result.current.start('a', perform));
    act(() => result.current.cancel('a'));
    act(() => setVisibility('hidden'));
    expect(perform).not.toHaveBeenCalled();
  });
});
