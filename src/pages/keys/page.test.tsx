import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { keysData } = vi.hoisted(() => ({
  keysData: [
    { id: "abcdef1234567890", name: "MyKey" },
    { id: "1234567890abcdef", name: "other-key" },
  ],
}));

vi.mock("./hooks", () => ({
  useKeys: () => ({ data: keysData, refetch: vi.fn() }),
  useRemoveKey: () => ({ mutate: vi.fn() }),
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
        <KeysPage />
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("KeysPage", () => {
  afterEach(cleanup);

  it("matches a key name regardless of case", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "mykey");

    expect(screen.getByText("MyKey")).toBeTruthy();
    expect(screen.queryByText("other-key")).toBeNull();
  });

  it("matches a key name when the query has uppercase letters", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search..."), "MYKEY");

    expect(screen.getByText("MyKey")).toBeTruthy();
    expect(screen.queryByText("other-key")).toBeNull();
  });

  it("labels the search input", () => {
    renderPage();

    expect(screen.getByLabelText("Search keys")).toBeTruthy();
  });

  it("names the copy and remove buttons", () => {
    renderPage();

    expect(
      screen.getAllByRole("button", { name: "Copy key ID" })
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Remove key MyKey" })
    ).toBeTruthy();
  });
});
