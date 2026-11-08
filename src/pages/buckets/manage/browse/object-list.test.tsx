import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bucketContext, browseResult } = vi.hoisted(() => ({
  bucketContext: {
    bucket: { id: "bucket-b", globalAliases: [] as string[], keys: [] },
    bucketName: "",
  },
  browseResult: {
    prefixes: [],
    objects: [
      {
        objectKey: "photo.jpg",
        url: "/buckets/bucket-b/objects/photo.jpg",
        size: 1200,
        lastModified: new Date("2026-01-01"),
      },
      {
        objectKey: "diagram.webp",
        url: "/buckets/bucket-b/objects/diagram.webp",
        size: 3400,
        lastModified: new Date("2026-01-02"),
      },
      {
        objectKey: "scan.avif",
        url: "/buckets/bucket-b/objects/scan.avif",
        size: 5600,
        lastModified: new Date("2026-01-03"),
      },
    ],
    prefix: "",
    nextToken: null,
    s3Bucket: "local-b",
  },
}));

vi.mock("../context", () => ({
  useBucketContext: () => bucketContext,
}));

vi.mock("./hooks", () => ({
  useBrowseObjects: () => ({
    data: browseResult,
    error: null,
    isLoading: false,
  }),
  useDeleteObject: () => ({ mutate: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ObjectList from "./object-list";

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ObjectList prefix="" />
    </QueryClientProvider>
  );
}

describe("ObjectList", () => {
  afterEach(cleanup);

  beforeEach(() => {
    bucketContext.bucket.globalAliases = [];
  });

  it("shows the local alias used for S3 when the bucket has no global alias", () => {
    renderList();

    expect(
      screen.getByText(
        'This bucket has no global alias. S3 requests use the local alias "local-b".'
      )
    ).toBeTruthy();
  });

  it("does not show the local alias note when the bucket has a global alias", () => {
    bucketContext.bucket.globalAliases = ["global-b"];

    renderList();

    expect(screen.queryByText(/local alias/)).toBeNull();
  });

  it("uses a lazy thumbnail for supported image types", () => {
    renderList();

    const img = screen.getByAltText("photo.jpg");
    expect(img.getAttribute("src")).toContain("?thumb=1");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("shows the file icon for image types without thumbnail support", () => {
    renderList();

    expect(screen.queryByAltText("diagram.webp")).toBeNull();
    expect(screen.queryByAltText("scan.avif")).toBeNull();
    expect(screen.getByText("diagram")).toBeTruthy();
    expect(screen.getByText("scan")).toBeTruthy();
  });

  it("falls back to the file icon when the thumbnail fails to load", () => {
    renderList();

    const img = screen.getByAltText("photo.jpg");
    fireEvent.error(img);

    expect(screen.queryByAltText("photo.jpg")).toBeNull();
    expect(screen.getByText("photo")).toBeTruthy();
  });
});
