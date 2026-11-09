import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignNodeDialog } from "../stores";

const { apiGet, apiPost } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: apiPost },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import AssignNodeDialog from "./assign-node-dialog";

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignNodeDialog />
    </QueryClientProvider>
  );
}

describe("AssignNodeDialog", () => {
  afterEach(() => {
    cleanup();
    assignNodeDialog.close();
  });

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/v2/GetClusterStatus") {
        return {
          layoutVersion: 1,
          nodes: [
            {
              id: "node-1",
              addr: "127.0.0.1:3901",
              hostname: "host-1",
              isUp: true,
              lastSeenSecsAgo: 0,
              draining: false,
              role: { zone: "dc1", capacity: 1_800_000_000_000, tags: ["ssd"] },
            },
          ],
        };
      }
      if (url === "/v2/GetClusterLayout") {
        return {
          version: 1,
          roles: [],
          parameters: { zoneRedundancy: "maximum" },
          partitionSize: 1024,
          stagedRoleChanges: [],
          stagedParameters: null,
        };
      }
      return {};
    });
    apiPost.mockResolvedValue({});
  });

  it("prefills the decimal capacity and submits the assigned node role", async () => {
    assignNodeDialog.open({
      nodeId: "node-1",
      zone: "dc1",
      capacity: 1_800_000_000_000,
      tags: ["ssd"],
    });
    const { container } = renderDialog();

    const capacityInput = container.querySelector(
      'input[name="capacity"]'
    ) as HTMLInputElement;
    await waitFor(() => expect(capacityInput.value).toBe("1.8"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v2/UpdateClusterLayout", {
        body: {
          parameters: null,
          roles: [
            {
              id: "node-1",
              zone: "dc1",
              capacity: 1_800_000_000_000,
              tags: ["ssd"],
            },
          ],
        },
      })
    );
  });

  it("sends null capacity when Gateway is checked", async () => {
    assignNodeDialog.open({
      nodeId: "node-1",
      zone: "dc1",
      capacity: null,
      tags: [],
    });
    renderDialog();

    const gateway = screen.getByRole("checkbox", {
      name: "Gateway",
    }) as HTMLInputElement;
    await waitFor(() => expect(gateway.checked).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v2/UpdateClusterLayout", {
        body: {
          parameters: null,
          roles: [
            {
              id: "node-1",
              zone: "dc1",
              capacity: null,
              tags: [],
            },
          ],
        },
      })
    );
  });
});
