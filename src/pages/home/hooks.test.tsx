import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: vi.fn() },
}));

import { useNodesHealth } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useNodesHealth", () => {
  it("refetches health every 30 seconds", async () => {
    vi.useFakeTimers();
    apiGet.mockResolvedValue({ nodes: [] });
    const { result } = renderHook(() => useNodesHealth(), { wrapper });

    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.isSuccess).toBe(true);
    expect(apiGet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
