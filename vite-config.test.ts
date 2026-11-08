// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("vite config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadConfig() {
    const mod = await import("./vite.config");
    const factory = mod.default as (options: {
      mode: string;
    }) => {
      base?: string;
      server?: { proxy?: Record<string, { target?: string }> };
    };
    return factory({ mode: "development" });
  }

  it("uses a root base and one proxy when no base path is set", async () => {
    const config = await loadConfig();
    expect(config.base).toBe("/");
    expect(Object.keys(config.server?.proxy ?? {}).sort()).toEqual(["/api"]);
  });

  it("uses the base path from VITE_BASE_PATH and proxies it", async () => {
    vi.stubEnv("VITE_BASE_PATH", "/sub/");
    const config = await loadConfig();
    expect(config.base).toBe("/sub/");
    expect(Object.keys(config.server?.proxy ?? {}).sort()).toEqual([
      "/api",
      "/sub/api",
    ]);
  });

  it("maps a lone slash base path to the root base", async () => {
    vi.stubEnv("VITE_BASE_PATH", "/");
    const config = await loadConfig();
    expect(config.base).toBe("/");
    expect(Object.keys(config.server?.proxy ?? {}).sort()).toEqual(["/api"]);
  });

  it("defaults the proxy target when VITE_API_URL is unset", async () => {
    const config = await loadConfig();
    expect(config.server?.proxy?.["/api"]?.target).toBe(
      "http://127.0.0.1:3909",
    );
  });

  it("uses VITE_API_URL as the proxy target when set", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3919");
    const config = await loadConfig();
    expect(config.server?.proxy?.["/api"]?.target).toBe(
      "http://127.0.0.1:3919",
    );
  });
});
