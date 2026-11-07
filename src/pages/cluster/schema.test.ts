import { describe, expect, it } from "vitest";
import { calculateCapacity, parseCapacity } from "./schema";

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
});
