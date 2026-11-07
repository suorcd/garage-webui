import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bucketContext, browseResult } = vi.hoisted(() => ({
  bucketContext: {
    bucket: { id: "bucket-b", globalAliases: [] as string[] },
    bucketName: "",
  },
  browseResult: {
    prefixes: [],
    objects: [],
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
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ObjectList from "./object-list";

describe("ObjectList", () => {
  afterEach(cleanup);

  beforeEach(() => {
    bucketContext.bucket.globalAliases = [];
  });

  it("shows the local alias used for S3 when the bucket has no global alias", () => {
    render(<ObjectList prefix="" />);

    expect(
      screen.getByText(
        'This bucket has no global alias. S3 requests use the local alias "local-b".'
      )
    ).toBeTruthy();
  });

  it("does not show the local alias note when the bucket has a global alias", () => {
    bucketContext.bucket.globalAliases = ["global-b"];

    render(<ObjectList prefix="" />);

    expect(screen.queryByText(/local alias/)).toBeNull();
  });
});
