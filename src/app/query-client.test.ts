import { describe, expect, it } from "vitest";
import { APIError } from "@/lib/api";
import { createQueryClient } from "./query-client";

const retry = createQueryClient().getDefaultOptions().queries
  ?.retry as (failureCount: number, error: unknown) => boolean;

describe("query client retry rule", () => {
  it("does not retry a 401", () => {
    expect(retry(0, new APIError("unauthorized", 401))).toBe(false);
  });

  it("does not retry a 429", () => {
    expect(retry(0, new APIError("too many login attempts", 429))).toBe(
      false
    );
  });

  it("retries other failures three times", () => {
    expect(retry(0, new APIError("boom", 500))).toBe(true);
    expect(retry(2, new APIError("boom", 500))).toBe(true);
    expect(retry(3, new APIError("boom", 500))).toBe(false);
  });
});
