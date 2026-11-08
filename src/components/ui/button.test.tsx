import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Info } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import Button from "./button";

describe("Button", () => {
  afterEach(cleanup);

  it("opens an external link in a new tab as a plain anchor", () => {
    render(
      <Button href="https://example.com/docs" target="_blank">
        Docs
      </Button>
    );

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("adds rel to a new-tab link", () => {
    render(
      <MemoryRouter>
        <Button href="/buckets" target="_blank">
          Buckets
        </Button>
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: "Buckets" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("adds no rel to a same-tab link", () => {
    render(
      <MemoryRouter>
        <Button href="https://example.com/docs">Docs</Button>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Docs" }).getAttribute("rel")
    ).toBeNull();
  });

  it("keeps an explicitly passed shape on an icon-only button", () => {
    render(<Button icon={Info} shape="square" />);

    const button = screen.getByRole("button");
    expect(button.classList.contains("btn-square")).toBe(true);
    expect(button.classList.contains("btn-circle")).toBe(false);
  });

  it("uses the circle shape by default for an icon-only button", () => {
    render(<Button icon={Info} />);

    expect(screen.getByRole("button").classList.contains("btn-circle")).toBe(
      true
    );
  });

  it("renders an internal link through the router", () => {
    render(
      <MemoryRouter>
        <Button href="/buckets">Buckets</Button>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Buckets" }).getAttribute("href")
    ).toBe("/buckets");
  });
});
