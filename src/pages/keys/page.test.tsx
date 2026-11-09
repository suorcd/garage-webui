import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { keysData, updateMutate, updateState } = vi.hoisted(() => ({
  keysData: [
    { id: "abcdef1234567890", name: "MyKey" },
    { id: "1234567890abcdef", name: "other-key" },
  ],
  updateMutate: vi.fn(),
  updateState: {
    isPending: false,
    variables: undefined as { id: string; createBucket: boolean } | undefined,
  },
}));

vi.mock("./hooks", () => ({
  useKeys: () => ({ data: keysData, refetch: vi.fn() }),
  useRemoveKey: () => ({ mutate: vi.fn() }),
  useUpdateKey: () => ({
    mutate: updateMutate,
    isPending: updateState.isPending,
    variables: updateState.variables,
  }),
}));

vi.mock("./components/create-key-dialog", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import KeysPage from "./page";

function renderPage(readOnly = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (readOnly) {
    queryClient.setQueryData(["auth"], {
      enabled: true,
      authenticated: true,
      role: "readonly",
    });
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <KeysPage />
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("KeysPage", () => {
  afterEach(() => {
    cleanup();
    updateState.isPending = false;
    updateState.variables = undefined;
  });

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

  it("toggles the create-bucket permission", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Allow key MyKey to create buckets",
      })
    );

    expect(updateMutate).toHaveBeenCalledWith({
      id: "abcdef1234567890",
      createBucket: true,
    });
  });

  it("disables only the key row being updated", () => {
    updateState.isPending = true;
    updateState.variables = { id: "abcdef1234567890", createBucket: true };
    renderPage();

    const first = screen.getByRole("checkbox", {
      name: "Allow key MyKey to create buckets",
    }) as HTMLInputElement;
    const second = screen.getByRole("checkbox", {
      name: "Allow key other-key to create buckets",
    }) as HTMLInputElement;

    expect(first.disabled).toBe(true);
    expect(second.disabled).toBe(false);
  });

  it("disables key mutations for a read-only viewer", () => {
    renderPage(true);

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Allow key MyKey to create buckets",
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Remove key MyKey",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
