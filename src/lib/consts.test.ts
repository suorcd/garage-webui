import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("BASE_PATH", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete window.__BASE_PATH;
  });

  async function loadBasePath(
    env: Record<string, string>,
    prodValue?: string,
  ) {
    if (prodValue !== undefined) {
      window.__BASE_PATH = prodValue;
    }
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const mod = await import("./consts");
    return mod.BASE_PATH as string;
  }

  it("strips a trailing slash from VITE_BASE_PATH", async () => {
    expect(await loadBasePath({ VITE_BASE_PATH: "/sub/" })).toBe("/sub");
  });

  it("maps a lone slash to an empty base path", async () => {
    expect(await loadBasePath({ VITE_BASE_PATH: "/" })).toBe("");
  });

  it("keeps a base path without a trailing slash", async () => {
    expect(await loadBasePath({ VITE_BASE_PATH: "/sub" })).toBe("/sub");
  });

  it("is empty when no base path is set", async () => {
    expect(await loadBasePath({})).toBe("");
  });

  it("treats the literal placeholder as empty in production", async () => {
    vi.stubEnv("PROD", true);
    expect(await loadBasePath({}, "%BASE_PATH%")).toBe("");
  });

  it("treats a production value without a leading slash as empty", async () => {
    vi.stubEnv("PROD", true);
    expect(await loadBasePath({}, "sub")).toBe("");
  });

  it("strips a trailing slash from the production value", async () => {
    vi.stubEnv("PROD", true);
    expect(await loadBasePath({}, "/sub/")).toBe("/sub");
  });
});

describe("API_URL", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadApiUrl(env: Record<string, string>) {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const mod = await import("./api");
    return mod.API_URL as string;
  }

  it("has no double slash when the base path has a trailing slash", async () => {
    expect(await loadApiUrl({ VITE_BASE_PATH: "/sub/" })).toBe("/sub/api");
  });

  it("has no double slash when the base path is a lone slash", async () => {
    expect(await loadApiUrl({ VITE_BASE_PATH: "/" })).toBe("/api");
  });

  it("is /api when no base path is set", async () => {
    expect(await loadApiUrl({})).toBe("/api");
  });
});
