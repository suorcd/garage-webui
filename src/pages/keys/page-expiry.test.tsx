// The expiry column must not depend on the browser zone, so pin one.
process.env.TZ = "America/Los_Angeles";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";
import { formatExpiryDate } from "@/lib/utils";

const { keysData, mockApiGet, mockRefetch } = vi.hoisted(() => {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  return {
    keysData: [
      {
        id: "GKACTIVE",
        name: "active",
        created: "2026-01-01T00:00:00Z",
        expiration: new Date(now + 90 * DAY).toISOString(),
        expired: false,
      },
      {
        id: "GKEXPIRED",
        name: "expired",
        created: "2025-01-01T00:00:00Z",
        expiration: "2020-06-01T12:00:00Z",
        expired: true,
      },
      {
        id: "GKDERIVED",
        name: "derived",
        created: "2025-01-01T00:00:00Z",
        expiration: "2020-06-01T12:00:00Z",
      },
      {
        id: "GKEXPIRING",
        name: "expiring",
        created: "2026-01-01T00:00:00Z",
        expiration: new Date(now + 3 * DAY).toISOString(),
        expired: false,
      },
      {
        id: "GKNEVER",
        name: "never",
        created: "2026-01-01T00:00:00Z",
        expiration: null,
        expired: false,
      },
    ],
    mockApiGet: vi.fn(),
    mockRefetch: vi.fn(),
  };
});

vi.mock("./hooks", () => ({
  useKeys: () => ({ data: keysData, refetch: mockRefetch }),
  useUpdateKey: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveKey: (options: {
    onSuccess?: (data: unknown, id: string) => void;
    onError?: (err: unknown) => void;
  }) => ({
    mutate: (id: string) => options?.onSuccess?.(undefined, id),
    isPending: false,
  }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: mockApiGet },
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
    mockApiGet.mockClear();
  });

  it("shows an Expired badge for an expired key", () => {
    renderPage();

    expect(screen.getAllByText("Expired")).toHaveLength(2);
  });

  it("shows an Expired badge when the expiration date passed without the flag", () => {
    renderPage();

    const row = screen.getByText("derived").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Expired")).toBeTruthy();
  });

  it("shows an Expiring soon badge for a key that expires within seven days", () => {
    renderPage();

    expect(screen.getByText("Expiring soon")).toBeTruthy();
  });

  it("shows Never for a key with no expiration", () => {
    renderPage();

    expect(screen.getByText("Never")).toBeTruthy();
  });

  it("shows the expiration date for a key with a future expiration", () => {
    renderPage();

    const expected = formatExpiryDate(keysData[0].expiration as string);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("View fetches the secret, toggles to Hide per row, and Hide clears it", async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValueOnce({ secretAccessKey: "s3cr3t-value" });
    renderPage();

    const viewButtons = screen.getAllByRole("button", { name: "View" });
    expect(viewButtons).toHaveLength(5);

    await user.click(viewButtons[0]);
    await screen.findByText("s3cr3t-value");

    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("s3cr3t-value")).toBeNull();
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(5);
  });

  it("disables the View button while the secret fetch is in flight", async () => {
    let resolveSecret!: (value: unknown) => void;
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecret = resolve;
      })
    );
    renderPage();

    const viewButton = screen.getAllByRole("button", {
      name: "View",
    })[0] as HTMLButtonElement;

    fireEvent.click(viewButton);
    expect(viewButton.disabled).toBe(true);

    fireEvent.click(viewButton);
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    resolveSecret({ secretAccessKey: "s3cr3t-value" });
    await screen.findByText("s3cr3t-value");
  });

  it("removing a key clears its shown secret", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApiGet.mockResolvedValueOnce({ secretAccessKey: "s3cr3t-value" });
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "View" })[0]);
    await screen.findByText("s3cr3t-value");

    const row = screen.getByText("active").closest("tr") as HTMLElement;
    const buttons = within(row).getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    expect(screen.queryByText("s3cr3t-value")).toBeNull();
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(5);
  });

  it("shows the UTC date for an expiry just after midnight UTC", () => {
    const edge = {
      id: "GKEDGE",
      name: "edge",
      created: "2026-01-01T00:00:00Z",
      expiration: "2026-11-08T02:00:00Z",
      expired: false,
    };
    keysData.push(edge);

    try {
      renderPage();

      expect(screen.getByText("2026-11-08 UTC")).toBeTruthy();
      expect(screen.queryByText("2026-11-07 UTC")).toBeNull();
    } finally {
      keysData.pop();
    }
  });
});
