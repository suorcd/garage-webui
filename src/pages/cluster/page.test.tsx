import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { nodeInfoState, clusterStatusState } = vi.hoisted(() => ({
  nodeInfoState: {
    node: undefined as
      | {
          nodeId: string;
          garageVersion: string;
          rustVersion: string;
          dbEngine: string;
        }
      | undefined,
    error: undefined as string | undefined,
    isError: false,
    isLoading: false,
    queryError: undefined as Error | undefined,
  },
  clusterStatusState: {
    data: { layoutVersion: 3, nodes: [] } as {
      layoutVersion: number;
      nodes: unknown[];
    } | null,
    isLoading: false,
    isError: false,
    error: undefined as Error | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("./hooks", () => ({
  useClusterStatus: () => clusterStatusState,
  useNodeInfo: () => ({
    data: { node: nodeInfoState.node, error: nodeInfoState.error },
    isError: nodeInfoState.isError,
    isLoading: nodeInfoState.isLoading,
    error: nodeInfoState.queryError,
  }),
}));

vi.mock("./components/nodes-list", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ClusterPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <ClusterPage />
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("ClusterPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    nodeInfoState.node = undefined;
    nodeInfoState.error = undefined;
    nodeInfoState.isError = false;
    nodeInfoState.isLoading = false;
    nodeInfoState.queryError = undefined;
    clusterStatusState.data = { layoutVersion: 3, nodes: [] };
    clusterStatusState.isLoading = false;
    clusterStatusState.isError = false;
    clusterStatusState.error = undefined;
    clusterStatusState.refetch.mockClear();
  });

  it("surfaces a node-info error instead of blank details", () => {
    nodeInfoState.error = "connection refused";

    renderPage();

    expect(screen.getByText(/connection refused/)).toBeTruthy();
  });

  it("shows a node-info query error instead of blank details", () => {
    nodeInfoState.isError = true;
    nodeInfoState.queryError = new Error("InvalidRequest");

    renderPage();

    expect(screen.getByText(/InvalidRequest/)).toBeTruthy();
  });

  it("shows the node details when node info loads", () => {
    nodeInfoState.node = {
      nodeId: "abc123",
      garageVersion: "2.5.0",
      rustVersion: "1.85.0",
      dbEngine: "sqlite",
    };

    renderPage();

    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.getByText("2.5.0")).toBeTruthy();
    expect(screen.getByText("1.85.0")).toBeTruthy();
    expect(screen.getByText("sqlite")).toBeTruthy();
    expect(screen.queryByText(/connection refused/)).toBeNull();
  });

  it("shows a loading indicator while the cluster status loads", () => {
    clusterStatusState.data = null;
    clusterStatusState.isLoading = true;

    renderPage();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows a loading indicator while node info loads", () => {
    nodeInfoState.isLoading = true;

    renderPage();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows an error alert with retry when the cluster status fails", () => {
    clusterStatusState.data = null;
    clusterStatusState.isError = true;
    clusterStatusState.error = new Error("Gateway timeout");

    renderPage();

    expect(screen.getByText(/Gateway timeout/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(clusterStatusState.refetch).toHaveBeenCalled();
  });
});
