import { describe, expect, it } from "vitest";
import { quotaSchema } from "./schema";

describe("quotaSchema", () => {
  it("accepts no quota for either field", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: null,
      maxSize: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts positive quotas", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: 5,
      maxSize: 2.5,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.maxObjects).toBe(5);
      expect(parsed.data.maxSize).toBe(2.5);
    }
  });

  it("rejects a negative max objects value", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: -5,
      maxSize: null,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("greater than 0");
    }
  });

  it("rejects a negative max size value", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: null,
      maxSize: -5,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("greater than 0");
    }
  });

  it("rejects zero for both quota fields", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: 0,
      maxSize: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a fractional max objects value", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: 2.5,
      maxSize: null,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("whole number");
    }
  });

  it("reads an empty field as no quota", () => {
    const parsed = quotaSchema.safeParse({
      enabled: true,
      maxObjects: "",
      maxSize: "",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.maxObjects).toBeNull();
      expect(parsed.data.maxSize).toBeNull();
    }
  });
});
