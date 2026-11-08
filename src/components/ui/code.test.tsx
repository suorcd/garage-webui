import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Code from "./code";

describe("Code copy button", () => {
  afterEach(cleanup);

  it("names the copy button", () => {
    render(<Code>secret-value</Code>);

    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
