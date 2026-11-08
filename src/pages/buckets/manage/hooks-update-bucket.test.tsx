import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiGet, apiPost, toastError } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: apiPost },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: toastError, warning: vi.fn() },
}));

import { useBucket, useUpdateBucket, type UpdateBucketRequest } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const bucketV1 = {
  id: "b1",
  globalAliases: [],
  localAliases: [],
  websiteAccess: false,
  keys: [],
  objects: 0,
  bytes: 0,
  unfinishedUploads: 0,
  unfinishedMultipartUploads: 0,
  unfinishedMultipartUploadParts: 0,
  unfinishedMultipartUploadBytes: 0,
  quotas: { maxSize: null, maxObjects: null },
};

describe("useUpdateBucket", () => {
  afterEach(() => {
    apiGet.mockClear();
    apiPost.mockClear();
    toastError.mockClear();
  });

  it("refetches the bucket when the update succeeds", async () => {
    apiGet
      .mockResolvedValueOnce(bucketV1)
      .mockResolvedValueOnce({ ...bucketV1, websiteAccess: true });
    apiPost.mockResolvedValueOnce({});

    const { result } = renderHook(
      () => ({
        bucket: useBucket("b1"),
        update: useUpdateBucket("b1"),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.bucket.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledTimes(1);

    result.current.update.mutate({
      websiteAccess: { enabled: true, indexDocument: "index.html" },
    });

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(result.current.bucket.data?.websiteAccess).toBe(true);
  });

  it("surfaces the error when the update fails", async () => {
    apiPost.mockRejectedValueOnce(new Error("Update failed"));

    const { result } = renderHook(() => useUpdateBucket("b1"), { wrapper });

    result.current.mutate({
      quotas: { maxObjects: 1, maxSize: null },
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Update failed")
    );
  });

  it("rejects a misspelled payload field", () => {
    const badPayload: UpdateBucketRequest = {
      // @ts-expect-error quotasMaxObjects is not a field of UpdateBucketRequest
      quotasMaxObjects: 5,
    };

    expect(badPayload).toBeDefined();
  });
});
