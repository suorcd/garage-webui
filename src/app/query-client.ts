import { QueryClient } from "@tanstack/react-query";
import { APIError } from "@/lib/api";

// Queries stay fresh for 30 seconds and do not refetch on window focus.
// A 401, a 408 timeout, or a 429 rate limit is never retried. Other
// failures retry three times, as before. A timeout retry would arm a fresh
// deadline on every attempt, so a stalled backend would cost minutes.
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (
            error instanceof APIError &&
            (error.status === 401 ||
              error.status === 408 ||
              error.status === 429)
          ) {
            return false;
          }
          return failureCount < 3;
        },
      },
    },
  });
