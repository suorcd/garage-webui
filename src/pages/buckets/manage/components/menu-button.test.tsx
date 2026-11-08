import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks", () => ({
  useRemoveBucket: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import MenuButton from "./menu-button";

describe("MenuButton", () => {
  afterEach(cleanup);

  it("names the row actions toggle", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/buckets/bucket-1"]}>
          <Routes>
            <Route path="/buckets/:id" element={<MenuButton />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("button", { name: "More actions" })
    ).toBeTruthy();
  });
});
