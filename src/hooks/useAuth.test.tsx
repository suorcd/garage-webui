import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { APIError } from "@/lib/api";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, default: { get: apiGet } };
});

import { useAuth } from "./useAuth";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAuth", () => {
  it("reports the authenticated state from the status query", async () => {
    apiGet.mockResolvedValue({ enabled: true, authenticated: true });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports a status query failure instead of treating it as logged out", async () => {
    apiGet.mockRejectedValue(new APIError("Internal Server Error", 500));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.isAuthenticated).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(APIError);
    expect((result.current.error as APIError).status).toBe(500);
    expect(typeof result.current.refetch).toBe("function");
  });
});
