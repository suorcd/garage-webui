import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { bucketsData } = vi.hoisted(() => ({
  bucketsData: [
    {
      id: "a-aliased",
      globalAliases: ["zebra"],
      localAliases: [],
      websiteAccess: false,
      keys: [],
      objects: 1,
      bytes: 2621440,
      unfinishedUploads: 0,
      unfinishedMultipartUploads: 0,
      unfinishedMultipartUploadParts: 0,
      unfinishedMultipartUploadBytes: 0,
      quotas: { maxSize: null, maxObjects: null },
    },
    {
      id: "b-noalias",
      globalAliases: [] as string[],
      localAliases: [],
      websiteAccess: false,
      keys: [],
      objects: 3,
      bytes: 1500,
      unfinishedUploads: 0,
      unfinishedMultipartUploads: 0,
      unfinishedMultipartUploadParts: 0,
      unfinishedMultipartUploadBytes: 0,
      quotas: { maxSize: null, maxObjects: null },
    },
  ],
}));

vi.mock("./hooks", () => ({
  useBuckets: () => ({ data: bucketsData }),
  useCreateBucket: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("./components/create-bucket-dialog", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import BucketsPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <MemoryRouter>
          <BucketsPage />
        </MemoryRouter>
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("BucketsPage", () => {
  afterEach(cleanup);

  it("renders a bucket with no aliases without crashing", () => {
    renderPage();

    expect(screen.getByText("1.5 KB")).toBeTruthy();
    expect(screen.getByText("2.5 MB")).toBeTruthy();
  });

  it("sorts by bucket id when a bucket has no alias", () => {
    renderPage();

    const browseLinks = screen.getAllByRole("link", { name: "Browse" });
    expect(browseLinks[0].getAttribute("href")).toBe(
      "/buckets/b-noalias?tab=browse"
    );
    expect(browseLinks[1].getAttribute("href")).toBe(
      "/buckets/a-aliased?tab=browse"
    );
  });
});
