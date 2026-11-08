import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignNodeDialog } from "../stores";
import type { GetClusterLayoutResult, Node } from "../types";

const GB = 1000 ** 3;

const { apiGet, apiPost, revertMutate, layoutData, newLayoutData } =
  vi.hoisted(() => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    revertMutate: vi.fn(),
    layoutData: {
      version: 3,
      roles: [
        { id: "node-a", zone: "dc1", capacity: 5 * 1000 ** 3, tags: ["fast"] },
        { id: "node-c", zone: "dc3", capacity: 3 * 1000 ** 3, tags: ["cold"] },
      ],
      stagedRoleChanges: [
        { id: "node-a", remove: true },
        { id: "node-c", remove: true },
      ],
    } as GetClusterLayoutResult,
    newLayoutData: {
      version: 4,
      roles: [],
      stagedRoleChanges: [],
    },
  }));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: apiPost },
}));

vi.mock("../hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks")>();
  return {
    ...actual,
    useRevertChanges: () => ({
      mutate: revertMutate,
      isPending: false,
      data: undefined,
      reset: vi.fn(),
    }),
  };
});

vi.mock("./connect-node-dialog", () => ({
  default: () => null,
}));

vi.mock("./assign-node-dialog", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import NodesList from "./nodes-list";

const nodes: Node[] = [
  {
    id: "node-a",
    hostname: "alpha",
    addr: "10.0.0.1:3903",
    isUp: true,
    lastSeenSecsAgo: 5,
    role: { zone: "DC1", capacity: 5 * GB, tags: ["fast"] },
    dataPartition: { available: 0, total: 0 },
  },
  {
    id: "node-b",
    hostname: null,
    addr: null,
    isUp: false,
    lastSeenSecsAgo: null,
    dataPartition: { available: 100, total: 1000 },
  },
  {
    id: "node-c",
    hostname: "gamma",
    addr: "10.0.0.3:3903",
    isUp: true,
    lastSeenSecsAgo: 2,
    dataPartition: { available: 50, total: 500 },
  },
];

function renderList(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NodesList nodes={nodes} />
    </QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("NodesList", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    assignNodeDialog.store.setState({ isOpen: false, data: null });
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/v2/GetClusterLayout") return layoutData;
      return {};
    });
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/v2/ApplyClusterLayout") {
        return { message: ["Layout applied"], layout: newLayoutData };
      }
      return {};
    });
  });

  it("does not crash when searching with a node that has no hostname or address", async () => {
    const user = userEvent.setup();
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-b")).toBeTruthy());

    await user.type(screen.getByPlaceholderText("Search..."), "node-b");

    expect(screen.getByText("node-b")).toBeTruthy();
    expect(screen.queryByText("node-a")).toBeNull();
  });

  it("matches a zone regardless of case", async () => {
    const user = userEvent.setup();
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-a")).toBeTruthy());

    await user.type(screen.getByPlaceholderText("Search..."), "dc1");

    expect(screen.getByText("node-a")).toBeTruthy();
    expect(screen.queryByText("node-b")).toBeNull();
    expect(screen.queryByText("node-c")).toBeNull();
  });

  it("matches a zone when the query has uppercase letters", async () => {
    const user = userEvent.setup();
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-a")).toBeTruthy());

    await user.type(screen.getByPlaceholderText("Search..."), "DC1");

    expect(screen.getByText("node-a")).toBeTruthy();
    expect(screen.queryByText("node-b")).toBeNull();
    expect(screen.queryByText("node-c")).toBeNull();
  });

  it("shows 0% instead of NaN% when a partition total is zero", async () => {
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-a")).toBeTruthy());

    expect(screen.getByText("0.0 B (0%)")).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("prefills the committed role when re-assigning a removal-staged node", async () => {
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-a")).toBeTruthy());

    fireEvent.click(screen.getAllByText("Assign")[0]);

    expect(assignNodeDialog.store.getState().data).toEqual({
      nodeId: "node-a",
      zone: "dc1",
      capacity: 5 * GB,
      tags: ["fast"],
    });
  });

  it("prefills the committed role for a removal-staged node with no status role", async () => {
    renderList(newClient());
    await waitFor(() => expect(screen.getByText("node-c")).toBeTruthy());

    fireEvent.click(screen.getAllByText("Assign")[2]);

    expect(assignNodeDialog.store.getState().data).toEqual({
      nodeId: "node-c",
      zone: "dc3",
      capacity: 3 * GB,
      tags: ["cold"],
    });
  });

  it("prefills the staged role when re-assigning a non-removal staged node", async () => {
    layoutData.stagedRoleChanges = [
      { id: "node-a", remove: false, zone: "dc2", capacity: 2 * GB, tags: ["slow"] },
    ];
    try {
      renderList(newClient());
      await waitFor(() => expect(screen.getByText("node-a")).toBeTruthy());

      fireEvent.click(screen.getAllByText("Assign")[0]);

      expect(assignNodeDialog.store.getState().data).toEqual({
        nodeId: "node-a",
        zone: "dc2",
        capacity: 2 * GB,
        tags: ["slow"],
      });
    } finally {
      layoutData.stagedRoleChanges = [
        { id: "node-a", remove: true },
        { id: "node-c", remove: true },
      ];
    }
  });

  it("sets the layout query data from the apply response", async () => {
    const user = userEvent.setup();
    const queryClient = newClient();
    renderList(queryClient);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Apply" })
      ).toBeTruthy()
    );

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(queryClient.getQueryData(["layout"])).toEqual(newLayoutData)
    );
  });

  it("calls revert with no version argument", async () => {
    renderList(newClient());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Revert" })
      ).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    expect(revertMutate).toHaveBeenCalledWith();
  });
});
