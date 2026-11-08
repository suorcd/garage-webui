import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PageContextProvider } from "@/context/page-context";
import NotFoundPage from "./not-found";

describe("NotFoundPage", () => {
  afterEach(cleanup);

  it("tells the user the page does not exist and links to the dashboard", () => {
    render(
      <PageContextProvider>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </PageContextProvider>
    );

    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Go to dashboard/ }).getAttribute("href")
    ).toBe("/");
  });
});
