import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    default: { ...actual.default, get: apiGet },
  };
});

import { APIError } from "@/lib/api";
import { useKeys } from "./hooks";

beforeEach(() => {
  apiGet.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useKeys", () => {
  it("falls back to ListKeys and loads permissions from GetKeyInfo when ListKeysInfo is missing", async () => {
    apiGet
      .mockRejectedValueOnce(new APIError("not found", 404))
      .mockResolvedValueOnce([{ id: "key-1", name: "first" }])
      .mockResolvedValueOnce({
        accessKeyId: "key-1",
        permissions: { createBucket: true },
      });

    const { result } = renderHook(() => useKeys(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenNthCalledWith(1, "/v2/ListKeysInfo");
    expect(apiGet).toHaveBeenNthCalledWith(2, "/v2/ListKeys");
    expect(apiGet).toHaveBeenNthCalledWith(3, "/v2/GetKeyInfo", {
      params: { id: "key-1" },
    });
    expect(result.current.data).toEqual([
      {
        id: "key-1",
        name: "first",
        permissions: { createBucket: true },
      },
    ]);
  });

  it("does not fall back for another error", async () => {
    apiGet.mockRejectedValueOnce(new APIError("server error", 500));

    const { result } = renderHook(() => useKeys(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/v2/ListKeysInfo");
  });
});
