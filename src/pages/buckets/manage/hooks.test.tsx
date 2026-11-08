import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiPost, toastWarning } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: apiPost },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: toastWarning },
}));

import { useAllowKey } from "./hooks";

const read = { read: true, write: false, owner: false };

const payload = [
  { keyId: "key-1", permissions: read },
  { keyId: "key-2", permissions: read },
  { keyId: "key-3", permissions: read },
];

describe("useAllowKey", () => {
  beforeEach(() => {
    apiPost.mockReset();
    toastWarning.mockClear();
  });

  const setup = (options?: Parameters<typeof useAllowKey>[1]) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAllowKey("bucket-1", options), {
      wrapper,
    });
    return { result, invalidateSpy };
  };

  it("returns a per-key summary when every grant succeeds", async () => {
    apiPost.mockResolvedValue({});
    const { result, invalidateSpy } = setup();

    const data = await result.current.mutateAsync(payload.slice(0, 2));

    expect(data).toEqual({ granted: ["key-1", "key-2"], failed: [] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["bucket", "bucket-1"],
    });
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("does not run the caller's success handler when a grant fails", async () => {
    apiPost
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("forbidden"));
    const onSuccess = vi.fn();
    const { result } = setup({ onSuccess });

    await result.current.mutateAsync(payload.slice(0, 2));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(
      expect.stringContaining("key-2")
    );
  });

  it("runs the caller's success handler when every grant succeeds", async () => {
    apiPost.mockResolvedValue({});
    const onSuccess = vi.fn();
    const { result } = setup({ onSuccess });

    await result.current.mutateAsync(payload.slice(0, 2));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("grants the keys that succeed and reports the key that fails", async () => {
    apiPost
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("forbidden"))
      .mockResolvedValueOnce({});
    const { result, invalidateSpy } = setup();

    const data = await result.current.mutateAsync(payload);

    expect(data).toEqual({
      granted: ["key-1", "key-3"],
      failed: [{ keyId: "key-2", reason: "forbidden" }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["bucket", "bucket-1"],
    });
    expect(toastWarning).toHaveBeenCalledWith(
      expect.stringContaining("key-2")
    );
    expect(toastWarning).toHaveBeenCalledWith(
      expect.stringContaining("forbidden")
    );
  });

  it("throws a per-key error when every grant fails", async () => {
    apiPost
      .mockRejectedValueOnce(new Error("forbidden"))
      .mockRejectedValueOnce(new Error("not found"));
    const { result, invalidateSpy } = setup();

    await expect(
      result.current.mutateAsync(payload.slice(0, 2))
    ).rejects.toThrow("key-1: forbidden; key-2: not found");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty payload", async () => {
    const { result } = setup();

    await expect(result.current.mutateAsync([])).rejects.toThrow(
      "Select at least one key and permission."
    );
  });
});
