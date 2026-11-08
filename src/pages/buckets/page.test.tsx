import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { bucketsData, bucketsState } = vi.hoisted(() => ({
  bucketsData: [
    {
      id: "a-aliased",
      globalAliases: ["Zebra"],
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
  bucketsState: {
    data: null as unknown,
    isLoading: false,
    isError: false,
    error: undefined as Error | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("./hooks", () => ({
  useBuckets: () => bucketsState,
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
  beforeEach(() => {
    bucketsState.data = bucketsData;
    bucketsState.isLoading = false;
    bucketsState.isError = false;
    bucketsState.error = undefined;
    bucketsState.refetch.mockClear();
  });

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

  it("matches an alias regardless of case", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "zebra");

    expect(screen.getByText("2.5 MB")).toBeTruthy();
    expect(screen.queryByText("1.5 KB")).toBeNull();
  });

  it("matches an alias when the query has uppercase letters", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "ZEBRA");

    expect(screen.getByText("2.5 MB")).toBeTruthy();
    expect(screen.queryByText("1.5 KB")).toBeNull();
  });

  it("shows a loading indicator while the buckets load", () => {
    bucketsState.data = null;
    bucketsState.isLoading = true;

    renderPage();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows an error alert with retry when the buckets fail to load", () => {
    bucketsState.data = null;
    bucketsState.isError = true;
    bucketsState.error = new Error("Buckets unavailable");

    renderPage();

    expect(screen.getByText(/Buckets unavailable/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(bucketsState.refetch).toHaveBeenCalled();
  });

  it("shows an empty state when the cluster has no buckets", () => {
    bucketsState.data = [];

    renderPage();

    expect(screen.getByText("No buckets yet")).toBeTruthy();
  });

  it("shows a no-match state when the search matches no bucket", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "zzz");

    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();
  });

  it("labels the search input", () => {
    renderPage();

    expect(screen.getByLabelText("Search buckets")).toBeTruthy();
  });
});
