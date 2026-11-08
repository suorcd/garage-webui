import { QueryClient } from "@tanstack/react-query";
import { APIError } from "@/lib/api";

// Queries stay fresh for 30 seconds and do not refetch on window focus.
// A 401 is never retried. Other failures retry three times, as before.
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof APIError && error.status === 401) {
            return false;
          }
          return failureCount < 3;
        },
      },
    },
  });
