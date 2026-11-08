import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GotoTopButton from "./goto-top-btn";

describe("GotoTopButton", () => {
  afterEach(cleanup);

  it("renders nothing while the page is at the top", () => {
    render(
      <main>
        <GotoTopButton />
      </main>
    );

    expect(screen.queryByRole("button", { name: "Top" })).toBeNull();
  });

  it("appears after scrolling down and hides again at the top", () => {
    render(
      <main>
        <GotoTopButton />
      </main>
    );
    const main = document.querySelector("main") as HTMLElement;

    Object.defineProperty(main, "scrollTop", {
      value: 400,
      configurable: true,
    });
    fireEvent.scroll(main);
    expect(screen.getByRole("button", { name: "Top" })).toBeTruthy();

    Object.defineProperty(main, "scrollTop", {
      value: 0,
      configurable: true,
    });
    fireEvent.scroll(main);
    expect(screen.queryByRole("button", { name: "Top" })).toBeNull();
  });
});
