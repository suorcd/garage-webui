import { describe, expect, it } from "vitest";
import { createFolderSchema } from "./schema";

describe("createFolderSchema", () => {
  it("accepts a folder name with an equal sign", () => {
    expect(
      createFolderSchema.safeParse({ name: "year=2026" }).success
    ).toBe(true);
  });

  it("rejects a folder name with a slash", () => {
    expect(createFolderSchema.safeParse({ name: "year/2026" }).success).toBe(
      false
    );
  });

  it("rejects an empty folder name", () => {
    expect(createFolderSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
