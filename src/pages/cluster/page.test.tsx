import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextProvider } from "@/context/page-context";

const { nodeInfoState } = vi.hoisted(() => ({
  nodeInfoState: {
    node: undefined as
      | { garageVersion: string; dbEngine: string }
      | undefined,
    error: undefined as string | undefined,
  },
}));

vi.mock("./hooks", () => ({
  useClusterStatus: () => ({ data: { layoutVersion: 3, nodes: [] } }),
  useNodeInfo: () => ({
    data: { node: nodeInfoState.node, error: nodeInfoState.error },
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
  });

  it("surfaces a node-info error instead of blank details", () => {
    nodeInfoState.error = "connection refused";

    renderPage();

    expect(screen.getByText(/connection refused/)).toBeTruthy();
  });

  it("shows the node details when node info loads", () => {
    nodeInfoState.node = { garageVersion: "2.5.0", dbEngine: "sqlite" };

    renderPage();

    expect(screen.getByText("2.5.0")).toBeTruthy();
    expect(screen.getByText("sqlite")).toBeTruthy();
    expect(screen.queryByText(/connection refused/)).toBeNull();
  });
});
