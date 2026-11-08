import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid calls into one call with the latest arguments", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, 500));

    result.current("one");
    result.current("two");
    vi.advanceTimersByTime(499);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("two");
  });

  it("calls the latest function when it changes before the timer fires", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useDebounce(fn, 500), {
      initialProps: { fn: first },
    });

    result.current();
    rerender({ fn: latest });
    vi.advanceTimersByTime(500);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("does not call the function after the component unmounts", () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(fn, 500));

    result.current();
    unmount();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });

  it("returns the same function across renders when only the callback changes", () => {
    const { result, rerender } = renderHook(
      ({ fn }) => useDebounce(fn, 500),
      { initialProps: { fn: () => {} } }
    );

    const debounced = result.current;
    rerender({ fn: () => {} });

    expect(result.current).toBe(debounced);
  });

  it("runs the pending call on unmount when flushOnUnmount is set", () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebounce(fn, 500, { flushOnUnmount: true })
    );

    result.current("late");
    unmount();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("late");
  });
});
