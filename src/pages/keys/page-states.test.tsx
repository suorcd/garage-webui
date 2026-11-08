import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { keysState, removeMutate } = vi.hoisted(() => ({
  keysState: {
    data: [
      { id: "key-1", name: "first" },
      { id: "key-2", name: "second" },
    ] as { id: string; name: string }[] | null,
    isLoading: false,
    isError: false,
    error: undefined as Error | undefined,
    refetch: vi.fn(),
  },
  removeMutate: vi.fn(),
}));

vi.mock("./hooks", () => ({
  useKeys: () => keysState,
  useRemoveKey: () => ({ mutate: removeMutate, isPending: false }),
}));

vi.mock("./components/create-key-dialog", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import KeysPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <MemoryRouter>
          <KeysPage />
        </MemoryRouter>
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("KeysPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    keysState.data = [
      { id: "key-1", name: "first" },
      { id: "key-2", name: "second" },
    ];
    keysState.isLoading = false;
    keysState.isError = false;
    keysState.error = undefined;
    keysState.refetch.mockClear();
  });

  it("renders the keys when they load", () => {
    renderPage();

    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
  });

  it("shows a loading indicator while the keys load", () => {
    keysState.data = null;
    keysState.isLoading = true;

    renderPage();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows an error alert with retry when the keys fail to load", () => {
    keysState.data = null;
    keysState.isError = true;
    keysState.error = new Error("Keys unavailable");

    renderPage();

    expect(screen.getByText(/Keys unavailable/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(keysState.refetch).toHaveBeenCalled();
  });

  it("shows an empty state when the cluster has no keys", () => {
    keysState.data = [];

    renderPage();

    expect(screen.getByText("No keys yet")).toBeTruthy();
  });

  it("shows a no-match state when the search matches no key", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "zzz");

    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();
  });

  it("does not claim the cluster is empty when the list fails", () => {
    keysState.data = null;
    keysState.isError = true;
    keysState.error = new Error("Keys unavailable");

    renderPage();

    expect(screen.getByText(/Keys unavailable/)).toBeTruthy();
    expect(screen.queryByText("No keys yet")).toBeNull();
  });
});
