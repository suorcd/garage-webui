import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import appStore from "@/stores/app-store";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isEnabled: true,
    isAuthenticated: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import Sidebar from "./sidebar";

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Sidebar theme switcher", () => {
  afterEach(() => {
    cleanup();
    appStore.setState({ theme: "suorcd" });
  });

  it("offers the theme as a labelled select", () => {
    renderSidebar();

    const select = screen.getByRole("combobox", {
      name: "Theme",
    }) as HTMLSelectElement;
    expect(select.value).toBe("suorcd");
  });

  it("changes the theme from the keyboard", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Theme" }),
      "dark"
    );

    expect(appStore.getState().theme).toBe("dark");
  });

  it("names the logo image", () => {
    renderSidebar();

    expect(
      screen.getByRole("img", { name: "Garage WebUI logo" })
    ).toBeTruthy();
  });

  it("keeps the nav links labelled", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cluster" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Buckets" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Keys" })).toBeTruthy();
  });
});
