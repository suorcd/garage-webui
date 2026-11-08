import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { bucketData, bucketState } = vi.hoisted(() => ({
  bucketData: {
    id: "b-noalias",
    globalAliases: [] as string[],
    localAliases: [],
    websiteAccess: false,
    keys: [
      {
        accessKeyId: "key-1",
        name: "key-1",
        permissions: { read: true, write: true, owner: false },
        bucketLocalAliases: [] as string[],
      },
    ],
    objects: 0,
    bytes: 0,
    unfinishedUploads: 0,
    unfinishedMultipartUploads: 0,
    unfinishedMultipartUploadParts: 0,
    unfinishedMultipartUploadBytes: 0,
    quotas: { maxSize: null, maxObjects: null },
  },
  bucketState: {
    data: null as unknown,
    error: null as Error | null,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("./hooks", () => ({
  useBucket: () => bucketState,
  useUpdateBucket: () => ({ mutate: vi.fn(), isPending: false }),
  useAddAlias: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveAlias: () => ({ mutate: vi.fn(), isPending: false }),
  useAllowKey: () => ({ mutate: vi.fn(), isPending: false }),
  useDenyKey: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveBucket: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("./overview/overview-tab", async () => {
  const { useBucketContext } = await import("./context");
  const OverviewTabProbe = () => {
    const { bucketName } = useBucketContext();
    return <p>{`bucketName:${bucketName}`}</p>;
  };
  return { default: OverviewTabProbe };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ManageBucketPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <MemoryRouter initialEntries={["/buckets/b-noalias"]}>
          <Routes>
            <Route path="/buckets/:id" element={<ManageBucketPage />} />
          </Routes>
        </MemoryRouter>
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("ManageBucketPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    bucketState.data = bucketData;
    bucketState.error = null;
    bucketState.isLoading = false;
    bucketState.refetch.mockClear();
  });

  it("falls back to the bucket id for bucketName when the bucket has no alias", () => {
    renderPage();

    expect(screen.getByText("bucketName:b-noalias")).toBeTruthy();
  });

  it("uses the local alias for bucketName when the bucket has no global alias", () => {
    bucketData.keys[0].bucketLocalAliases = ["local-b"];
    try {
      renderPage();

      expect(screen.getByText("bucketName:local-b")).toBeTruthy();
    } finally {
      bucketData.keys[0].bucketLocalAliases = [];
    }
  });

  it("retries the bucket load from the error alert", () => {
    bucketState.data = null;
    bucketState.error = new Error("Bucket not found");

    renderPage();

    expect(screen.getByText(/Bucket not found/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(bucketState.refetch).toHaveBeenCalled();
  });
});
