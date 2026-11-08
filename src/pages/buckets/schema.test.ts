import { describe, expect, it } from "vitest";
import { createBucketSchema } from "./schema";

describe("createBucketSchema", () => {
  it("accepts a valid bucket name", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "my-bucket" });

    expect(parsed.success).toBe(true);
  });

  it("trims spaces around the name before submit", () => {
    const parsed = createBucketSchema.safeParse({
      globalAlias: " my-bucket ",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.globalAlias).toBe("my-bucket");
    }
  });

  it("rejects a name with a space inside it", () => {
    const parsed = createBucketSchema.safeParse({
      globalAlias: " My Bucket ",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("lowercase letters");
    }
  });

  it("rejects uppercase letters", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "My-Bucket" });

    expect(parsed.success).toBe(false);
  });

  it("rejects a name shorter than 3 characters", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "ab" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("3 to 63");
    }
  });

  it("rejects a name longer than 63 characters", () => {
    const parsed = createBucketSchema.safeParse({
      globalAlias: "a".repeat(64),
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("3 to 63");
    }
  });

  it("rejects a name that starts with a hyphen", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "-bucket" });

    expect(parsed.success).toBe(false);
  });

  it("rejects a name that ends with a period", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "bucket." });

    expect(parsed.success).toBe(false);
  });

  it("rejects two periods in a row", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "my..bucket" });

    expect(parsed.success).toBe(false);
  });

  it("rejects a name shaped like an IP address", () => {
    const parsed = createBucketSchema.safeParse({
      globalAlias: "192.168.5.4",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a name that starts with xn--", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "xn--bucket" });

    expect(parsed.success).toBe(false);
  });

  it("rejects a name that ends with -s3alias", () => {
    const parsed = createBucketSchema.safeParse({
      globalAlias: "bucket-s3alias",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Bucket Name is required");
    }
  });

  it("rejects a name of only spaces", () => {
    const parsed = createBucketSchema.safeParse({ globalAlias: "   " });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Bucket Name is required");
    }
  });
});
