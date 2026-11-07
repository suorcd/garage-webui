import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: vi.fn() },
}));

import { useNodeInfo } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const nodeInfo = {
  nodeId: "self",
  garageVersion: "2.5.0",
  garageFeatures: [],
  rustVersion: "1.85.0",
  dbEngine: "sqlite",
};

describe("useNodeInfo", () => {
  it("selects the self node from the success map", async () => {
    apiGet.mockResolvedValueOnce({
      success: { self: nodeInfo },
      error: {},
    });

    const { result } = renderHook(() => useNodeInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ node: nodeInfo, error: undefined });
  });

  it("surfaces the self node error instead of a blank node", async () => {
    apiGet.mockResolvedValueOnce({
      success: {},
      error: { self: "connection refused" },
    });

    const { result } = renderHook(() => useNodeInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      node: undefined,
      error: "connection refused",
    });
  });
});
