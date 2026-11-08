// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function runThemeScript(stored: string | null) {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  const themeScript = scripts.find((s) => s.includes("localStorage"));
  expect(themeScript).toBeTruthy();
  const setCalls: Array<[string, string]> = [];
  const document = {
    documentElement: {
      setAttribute: (key: string, value: string) =>
        setCalls.push([key, value]),
    },
  };
  const localStorage = { getItem: () => stored };
  new Function("document", "localStorage", themeScript!)(
    document,
    localStorage,
  );
  return setCalls;
}

describe("index.html theme script", () => {
  it("applies the persisted theme before paint", () => {
    const calls = runThemeScript(
      JSON.stringify({ state: { theme: "dark" }, version: 0 }),
    );
    expect(calls).toEqual([["data-theme", "dark"]]);
  });

  it("falls back to the default theme for an unknown stored theme", () => {
    const calls = runThemeScript(
      JSON.stringify({ state: { theme: "banana" }, version: 0 }),
    );
    expect(calls).toEqual([["data-theme", "suorcd"]]);
  });

  it("falls back to the default theme when nothing is stored", () => {
    const calls = runThemeScript(null);
    expect(calls).toEqual([["data-theme", "suorcd"]]);
  });

  it("falls back to the default theme when storage is corrupt", () => {
    const calls = runThemeScript("{not json");
    expect(calls).toEqual([["data-theme", "suorcd"]]);
  });
});
