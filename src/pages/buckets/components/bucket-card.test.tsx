import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import BucketCard from "./bucket-card";
import { Bucket } from "../types";

const bucket: Bucket & { aliases: string[] } = {
  id: "bucket-1",
  globalAliases: ["bucket-1"],
  localAliases: [],
  websiteAccess: false,
  keys: [],
  objects: 3,
  bytes: 1024,
  unfinishedUploads: 0,
  unfinishedMultipartUploads: 0,
  unfinishedMultipartUploadParts: 0,
  unfinishedMultipartUploadBytes: 0,
  quotas: { maxSize: null, maxObjects: null },
  aliases: ["bucket-1"],
};

describe("BucketCard", () => {
  afterEach(cleanup);

  it("shows the error when the bucket fetch failed", () => {
    render(
      <MemoryRouter>
        <BucketCard
          data={{ ...bucket, error: "cannot get bucket info: boom" }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("cannot get bucket info: boom")).toBeTruthy();
  });

  it("shows no error note when the bucket has no error", () => {
    render(
      <MemoryRouter>
        <BucketCard data={bucket} />
      </MemoryRouter>
    );

    expect(screen.queryByText(/cannot get bucket info/)).toBeNull();
  });
});
