import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bucketContext, browseResult, defaultObjects } = vi.hoisted(() => {
  const defaultObjects = [
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
  ];
  return {
    defaultObjects,
    bucketContext: {
      bucket: { id: "bucket-b", globalAliases: [] as string[], keys: [] },
      bucketName: "",
    },
    browseResult: {
      prefixes: [] as string[],
      objects: defaultObjects.slice(),
      prefix: "",
      nextToken: null,
      s3Bucket: "local-b",
    },
  };
});

vi.mock("../context", () => ({
  useBucketContext: () => bucketContext,
}));

vi.mock("./hooks", () => ({
  useBrowseObjectsInfinite: () => ({
    data: { pages: [browseResult], pageParams: [undefined] },
    error: null,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useDeleteObject: () => ({ mutate: vi.fn(), isPending: false }),
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
      <MemoryRouter initialEntries={["/browse?prefix="]}>
        <ObjectList prefix="" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ObjectList", () => {
  afterEach(cleanup);

  beforeEach(() => {
    bucketContext.bucket.globalAliases = [];
    browseResult.prefixes = [];
    browseResult.objects = defaultObjects.slice();
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

  it("opens the last folder dropdowns upward in a long list", () => {
    browseResult.objects = [];
    browseResult.prefixes = ["a/", "b/", "c/", "d/", "e/", "f/"];

    const { container } = renderList();
    const dropdowns = [...container.querySelectorAll(".dropdown")];

    expect(dropdowns).toHaveLength(6);
    expect(
      dropdowns.slice(0, 4).every((d) => d.classList.contains("dropdown-bottom"))
    ).toBe(true);
    expect(
      dropdowns.slice(4).every((d) => d.classList.contains("dropdown-top"))
    ).toBe(true);
  });

  it("opens folder dropdowns downward in a short list", () => {
    browseResult.objects = [];
    browseResult.prefixes = ["a/", "b/"];

    const { container } = renderList();
    const dropdowns = [...container.querySelectorAll(".dropdown")];

    expect(dropdowns).toHaveLength(2);
    expect(
      dropdowns.every((d) => d.classList.contains("dropdown-bottom"))
    ).toBe(true);
  });
});

describe("ObjectList object view", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    bucketContext.bucket.globalAliases = [];
    browseResult.objects = [
      {
        objectKey: "file.txt",
        url: "/browse/bucket-b/file.txt",
        size: 10,
        lastModified: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("opens the object view in a new tab without opener access", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /file\s*\.txt/ }));

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("?view=1"),
      "_blank",
      "noopener,noreferrer"
    );
  });
});
