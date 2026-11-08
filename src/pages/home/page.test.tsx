import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { healthState, bucketsState } = vi.hoisted(() => ({
  healthState: {
    data: {
      status: "healthy",
      knownNodes: 3,
      connectedNodes: 3,
      storageNodes: 2,
      storageNodesUp: 2,
      partitions: 10,
      partitionsQuorum: 10,
      partitionsAllOk: 10,
    } as {
      status: string;
      knownNodes: number;
      connectedNodes: number;
      storageNodes: number;
      storageNodesUp: number;
      partitions: number;
      partitionsQuorum: number;
      partitionsAllOk: number;
    } | null,
    isLoading: false,
    isError: false,
    error: undefined as Error | undefined,
    refetch: vi.fn(),
  },
  bucketsState: {
    data: [] as { bytes: number }[],
    isLoading: false,
    isError: false,
    error: undefined as Error | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("./hooks", () => ({
  useNodesHealth: () => healthState,
}));

vi.mock("../buckets/hooks", () => ({
  useBuckets: () => bucketsState,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import HomePage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <HomePage />
      </PageContextProvider>
    </QueryClientProvider>
  );
}

function statusValue() {
  const title = screen.getByText("Status");
  const value = title.parentElement?.querySelector("p");
  return value;
}

describe("HomePage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    healthState.data = {
      status: "healthy",
      knownNodes: 3,
      connectedNodes: 3,
      storageNodes: 2,
      storageNodesUp: 2,
      partitions: 10,
      partitionsQuorum: 10,
      partitionsAllOk: 10,
    };
    healthState.isLoading = false;
    healthState.isError = false;
    healthState.error = undefined;
    healthState.refetch.mockClear();
    bucketsState.data = [];
    bucketsState.isLoading = false;
    bucketsState.isError = false;
    bucketsState.error = undefined;
    bucketsState.refetch.mockClear();
  });

  it("shows the status when health loads", () => {
    renderPage();

    expect(screen.getByText("Healthy")).toBeTruthy();
    expect(screen.getByText("0.0 B")).toBeTruthy();
  });

  it("shows a loading indicator while health loads", () => {
    healthState.data = null;
    healthState.isLoading = true;

    renderPage();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows dots with no error colour on the status card while loading", () => {
    healthState.data = null;
    healthState.isLoading = true;

    renderPage();

    const value = statusValue();
    expect(value?.textContent).toBe("...");
    expect(value?.className).not.toContain("text-error");
  });

  it("shows an error alert with retry when health fails", async () => {
    healthState.data = null;
    healthState.isError = true;
    healthState.error = new Error("Cluster unreachable");

    renderPage();

    expect(screen.getByText(/Cluster unreachable/)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(healthState.refetch).toHaveBeenCalled();
    expect(bucketsState.refetch).toHaveBeenCalled();
  });
});
