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

const nodeId =
  "e09e9377a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6";

const nodeInfo = {
  nodeId,
  garageVersion: "2.5.0",
  garageFeatures: [],
  rustVersion: "1.85.0",
  dbEngine: "sqlite",
};

describe("useNodeInfo", () => {
  it("selects the node from the success map keyed by node id", async () => {
    apiGet.mockResolvedValueOnce({
      success: { [nodeId]: nodeInfo },
      error: {},
    });

    const { result } = renderHook(() => useNodeInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ node: nodeInfo, error: undefined });
  });

  it("surfaces the node error from the error map keyed by node id", async () => {
    apiGet.mockResolvedValueOnce({
      success: {},
      error: { [nodeId]: "connection refused" },
    });

    const { result } = renderHook(() => useNodeInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      node: undefined,
      error: "connection refused",
    });
  });
});
