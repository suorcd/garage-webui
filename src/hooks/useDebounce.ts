import { useCallback, useRef } from "react";

export const useDebounce = <T extends (...args: never[]) => void>(
  fn: T,
  delay: number = 500
) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );

  return debouncedFn as T;
};
