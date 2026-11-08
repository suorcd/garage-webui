import { describe, expect, it } from "vitest";
import {
  calculateCapacity,
  connectNodeSchema,
  parseCapacity,
} from "./schema";

const GB = 1000 ** 3;
const TB = 1000 ** 4;

describe("parseCapacity", () => {
  it("keeps a decimal capacity in TB", () => {
    const parsed = parseCapacity(1.8 * TB);

    expect(parsed).toEqual({ value: 1.8, unit: "TB" });
    expect(calculateCapacity(parsed.value, parsed.unit)).toBeCloseTo(1.8 * TB, 0);
  });

  it("keeps a whole capacity in GB", () => {
    const parsed = parseCapacity(900 * GB);

    expect(parsed).toEqual({ value: 900, unit: "GB" });
    expect(calculateCapacity(parsed.value, parsed.unit)).toBe(900 * GB);
  });

  it("returns zero for an empty value", () => {
    expect(parseCapacity(undefined)).toEqual({ value: 0, unit: undefined });
  });

  it("keeps a sub-1 MB capacity in bytes and round-trips it", () => {
    const parsed = parseCapacity(1500);

    expect(parsed).toEqual({ value: 1500, unit: "B" });
    expect(calculateCapacity(parsed.value, parsed.unit)).toBe(1500);
  });

  it("keeps a small capacity in bytes and round-trips it", () => {
    const parsed = parseCapacity(500);

    expect(parsed).toEqual({ value: 500, unit: "B" });
    expect(calculateCapacity(parsed.value, parsed.unit)).toBe(500);
  });

  it("keeps a decimal capacity in MB and round-trips it", () => {
    const parsed = parseCapacity(1.5 * 1000 ** 2);

    expect(parsed).toEqual({ value: 1.5, unit: "MB" });
    expect(calculateCapacity(parsed.value, parsed.unit)).toBe(1.5 * 1000 ** 2);
  });
});

describe("connectNodeSchema", () => {
  it("rejects an empty node id", () => {
    const result = connectNodeSchema.safeParse({ nodeId: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Node ID is required");
    }
  });

  it("accepts a bare node id", () => {
    expect(connectNodeSchema.safeParse({ nodeId: "abc123" }).success).toBe(
      true
    );
  });

  it("accepts a node id with a host:port address", () => {
    expect(
      connectNodeSchema.safeParse({
        nodeId: "abc123",
        address: "10.0.0.2:3901",
      }).success
    ).toBe(true);
  });

  it("accepts an empty address", () => {
    expect(
      connectNodeSchema.safeParse({ nodeId: "abc123", address: "" }).success
    ).toBe(true);
  });

  it("rejects an address with a space", () => {
    expect(
      connectNodeSchema.safeParse({ nodeId: "abc123", address: "a b" })
        .success
    ).toBe(false);
  });

  it("rejects an address with @", () => {
    expect(
      connectNodeSchema.safeParse({ nodeId: "abc123", address: "a@b" })
        .success
    ).toBe(false);
  });
});
