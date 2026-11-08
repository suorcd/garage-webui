import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: vi.fn() },
}));

import { useBrowseObjectsInfinite } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const pageOne = {
  prefixes: [],
  objects: [
    {
      objectKey: "obj-0000.txt",
      lastModified: new Date(),
      size: 1,
      url: "/browse/bucket-b/obj-0000.txt",
    },
  ],
  prefix: "",
  nextToken: "token-2",
  s3Bucket: "local-b",
};

const pageTwo = {
  prefixes: [],
  objects: [
    {
      objectKey: "obj-1000.txt",
      lastModified: new Date(),
      size: 1,
      url: "/browse/bucket-b/obj-1000.txt",
    },
  ],
  prefix: "",
  nextToken: null,
  s3Bucket: "local-b",
};

describe("useBrowseObjectsInfinite", () => {
  beforeEach(() => {
    apiGet.mockClear();
  });

  it("fetches the first page without a next token and reports a next page", async () => {
    apiGet.mockResolvedValueOnce(pageOne);

    const { result } = renderHook(
      () => useBrowseObjectsInfinite("bucket-b", { prefix: "", limit: 1000 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/browse/bucket-b", {
      params: { prefix: "", limit: 1000 },
    });
    expect(
      (apiGet.mock.calls[0][1] as { params: Record<string, unknown> }).params
    ).not.toHaveProperty("next");
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.data?.pages).toHaveLength(1);
  });

  it("fetches the next page with the token from the last page", async () => {
    apiGet.mockResolvedValueOnce(pageOne).mockResolvedValueOnce(pageTwo);

    const { result } = renderHook(
      () => useBrowseObjectsInfinite("bucket-b", { prefix: "", limit: 1000 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    void result.current.fetchNextPage();

    await waitFor(() =>
      expect(result.current.data?.pages).toHaveLength(2)
    );

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenCalledWith("/browse/bucket-b", {
      params: { prefix: "", limit: 1000, next: "token-2" },
    });
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data?.pages[1].objects[0].objectKey).toBe(
      "obj-1000.txt"
    );
  });

  it("starts from the token passed as the initial token", async () => {
    apiGet.mockResolvedValueOnce(pageTwo);

    const { result } = renderHook(
      () =>
        useBrowseObjectsInfinite(
          "bucket-b",
          { prefix: "", limit: 1000 },
          "token-9"
        ),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/browse/bucket-b", {
      params: { prefix: "", limit: 1000, next: "token-9" },
    });
  });
});
