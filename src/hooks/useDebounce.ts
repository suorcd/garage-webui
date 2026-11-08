import { useCallback, useEffect, useRef } from "react";

type Options = {
  // Run a call that is still waiting when the component unmounts. Turn this
  // on for an autosave: without it, leaving the screen inside the delay
  // window drops the edit with no message.
  flushOnUnmount?: boolean;
};

export const useDebounce = <T extends (...args: never[]) => void>(
  fn: T,
  delay: number = 500,
  options?: Options
) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const flushOnUnmount = options?.flushOnUnmount ?? false;

  useEffect(() => {
    return () => {
      if (!timerRef.current) {
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (flushOnUnmount && argsRef.current) {
        fnRef.current(...argsRef.current);
      }
    };
  }, [flushOnUnmount]);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      argsRef.current = args;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        argsRef.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay]
  );

  return debouncedFn as T;
};
