import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { GetObjectsResult } from "./types";

const { bucketContext, infiniteState, capturedArgs } = vi.hoisted(() => ({
  bucketContext: {
    bucket: { id: "bucket-b", globalAliases: [] as string[], keys: [] as unknown[] },
    bucketName: "",
  },
  infiniteState: {
    pages: [] as GetObjectsResult[],
    pageParams: [] as (string | undefined)[],
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn() as unknown as () => Promise<unknown>,
  },
  capturedArgs: {
    bucket: "",
    options: {} as Record<string, unknown>,
    initialToken: undefined as string | undefined,
  },
}));

vi.mock("../context", () => ({
  useBucketContext: () => bucketContext,
}));

vi.mock("./hooks", () => ({
  useBrowseObjectsInfinite: (
    bucket: string,
    options: Record<string, unknown>,
    initialToken?: string
  ) => {
    capturedArgs.bucket = bucket;
    capturedArgs.options = options;
    capturedArgs.initialToken = initialToken;
    return {
      data: { pages: infiniteState.pages, pageParams: infiniteState.pageParams },
      error: null,
      isLoading: false,
      isFetchingNextPage: infiniteState.isFetchingNextPage,
      hasNextPage: infiniteState.hasNextPage,
      fetchNextPage: infiniteState.fetchNextPage,
    };
  },
}));

vi.mock("./object-actions", () => ({
  default: () => null,
}));

import ObjectList from "./object-list";

const makeObjects = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const n = start + i;
    const key = `obj-${String(n).padStart(4, "0")}.jpg`;
    return {
      objectKey: key,
      lastModified: new Date(),
      size: 1,
      url: `/browse/bucket-b/${key}`,
    };
  });

const pageOne: GetObjectsResult = {
  prefixes: [],
  objects: makeObjects(0, 1000),
  prefix: "",
  nextToken: "token-2",
  s3Bucket: "local-b",
};

const pageTwo: GetObjectsResult = {
  prefixes: [],
  objects: makeObjects(1000, 1),
  prefix: "",
  nextToken: null,
  s3Bucket: "local-b",
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

const renderWithRouter = (initialEntry: string, ui: ReactElement) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      {ui}
    </MemoryRouter>
  );

describe("ObjectList pagination", () => {
  afterEach(cleanup);

  beforeEach(() => {
    bucketContext.bucket.globalAliases = [];
    infiniteState.pages = [pageOne];
    infiniteState.pageParams = [undefined];
    infiniteState.hasNextPage = true;
    infiniteState.isFetchingNextPage = false;
    infiniteState.fetchNextPage = vi.fn(() => {
      infiniteState.pages = [pageOne, pageTwo];
      infiniteState.pageParams = [undefined, "token-2"];
      infiniteState.hasNextPage = false;
      return Promise.resolve();
    }) as unknown as () => Promise<unknown>;
    capturedArgs.bucket = "";
    capturedArgs.options = {};
    capturedArgs.initialToken = undefined;
  });

  // Rendering 1000 rows is slow in jsdom on this machine, so this test
  // gets a longer timeout. The behavior it checks is pagination, not
  // render speed.
  it("loads objects past 1000 only when the user clicks Load more", async () => {
    const { rerender } = renderWithRouter(
      "/browse?prefix=",
      <ObjectList prefix="" />
    );

    expect(screen.getByText("obj-0000")).toBeTruthy();
    expect(screen.getByText("More objects exist.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Load more" })
    ).toBeTruthy();
    expect(screen.queryByText("obj-1000")).toBeNull();
    expect(infiniteState.fetchNextPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(infiniteState.fetchNextPage).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter initialEntries={["/browse?prefix="]}>
        <LocationProbe />
        <ObjectList prefix="" />
      </MemoryRouter>
    );

    expect(screen.getByText("obj-1000")).toBeTruthy();
    expect(screen.queryByText("More objects exist.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByTestId("location-search").textContent
      ).toContain("next=token-2")
    );
  }, 120000);

  it("reads the page token from the URL on load", () => {
    infiniteState.pages = [
      { ...pageTwo, nextToken: null },
    ];
    infiniteState.pageParams = ["token-9"];
    infiniteState.hasNextPage = false;

    renderWithRouter(
      "/browse?prefix=photos%2F&next=token-9",
      <ObjectList prefix="photos/" />
    );

    expect(capturedArgs.bucket).toBe("bucket-b");
    expect(capturedArgs.options.prefix).toBe("photos/");
    expect(capturedArgs.initialToken).toBe("token-9");
  });
});
