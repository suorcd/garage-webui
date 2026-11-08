import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary";

let shouldThrow = true;

const Flaky = () => {
  if (shouldThrow) {
    throw new Error("render boom");
  }
  return <p>recovered</p>;
};

function renderBoundary() {
  return render(
    <MemoryRouter>
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    </MemoryRouter>
  );
}

describe("ErrorBoundary", () => {
  afterEach(cleanup);

  it("shows a fallback instead of unmounting when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      shouldThrow = true;
      renderBoundary();

      expect(screen.getByText(/Something went wrong/)).toBeTruthy();
      expect(screen.getByText(/render boom/)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("renders the children again after reset", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      shouldThrow = true;
      renderBoundary();

      shouldThrow = false;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(screen.getByText("recovered")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
