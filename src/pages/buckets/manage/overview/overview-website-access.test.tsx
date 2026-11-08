import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bucketContext, configData } = vi.hoisted(() => ({
  bucketContext: {
    bucket: {
      id: "bucket-1",
      websiteAccess: true,
      websiteConfig: {
        indexDocument: "index.html",
        errorDocument: "error/400.html",
      },
    },
    bucketName: "mybucket",
    refetch: () => {},
  },
  configData: {
    s3_web: {
      bind_addr: "127.0.0.1:3902",
      root_domain: ".example.com" as string | undefined,
    },
  },
}));

vi.mock("../context", () => ({
  useBucketContext: () => bucketContext,
}));

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({ data: configData }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (fn: (...args: never[]) => void) => fn,
}));

vi.mock("../hooks", () => ({
  useUpdateBucket: () => ({ mutate: vi.fn() }),
}));

import WebsiteAccessSection from "./overview-website-access";

const renderSection = () => {
  return render(
    <MemoryRouter>
      <WebsiteAccessSection />
    </MemoryRouter>
  );
};

describe("WebsiteAccessSection", () => {
  afterEach(cleanup);

  beforeEach(() => {
    configData.s3_web.root_domain = ".example.com";
  });

  it("adds rel to every new-tab link", () => {
    renderSection();

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("drops the bare bucket link when a root domain is set", () => {
    renderSection();

    expect(screen.queryByRole("link", { name: "mybucket" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "mybucket.example.com" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "mybucket.example.com:3902" })
    ).toBeTruthy();
  });

  it("keeps the bare bucket link when no root domain is set", () => {
    configData.s3_web.root_domain = undefined;

    renderSection();

    const link = screen.getByRole("link", { name: "mybucket" });
    expect(link.getAttribute("href")).toBe("http://mybucket");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
