import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { apiPost, toastError, toastSuccess } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: apiPost },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, warning: vi.fn() },
}));

import ConnectNodeDialog from "./connect-node-dialog";

const nodeId =
  "e09e9377a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6";

// jsdom has no showModal, show, or close on HTMLDialogElement. Stub them
// so the dialog opens and closes through its open attribute.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
    .showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<ConnectNodeDialog />, { wrapper });
  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(dialog().open).toBe(true);
}

describe("ConnectNodeDialog", () => {
  it("keeps the dialog open when the connect fails", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new Error("node unreachable"));
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("..."), nodeId);
    await user.click(screen.getByText("Save"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(dialog().open).toBe(true);
    expect(screen.getByPlaceholderText("...") as HTMLInputElement).toHaveProperty(
      "value",
      nodeId
    );
    expect(apiPost).toHaveBeenCalledWith("/v2/ConnectClusterNodes", {
      body: [nodeId],
    });
  });

  it("closes the dialog when the connect succeeds", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce([{ success: {} }]);
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("..."), nodeId);
    await user.click(screen.getByText("Save"));

    await waitFor(() => expect(dialog().open).toBe(false));
    expect(toastSuccess).toHaveBeenCalledWith("Node connected!");
  });

  it("shows Node ID is required when submitted empty", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByText("Save"));

    expect(await screen.findByText("Node ID is required")).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("sends id@address when an address is given", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce([{ success: {} }]);
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("..."), nodeId);
    await user.type(
      screen.getByPlaceholderText("127.0.0.1:3901"),
      "10.0.0.2:3901"
    );
    await user.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v2/ConnectClusterNodes", {
        body: [`${nodeId}@10.0.0.2:3901`],
      })
    );
  });

  it("sends the bare id when no address is given", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce([{ success: {} }]);
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("..."), nodeId);
    await user.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v2/ConnectClusterNodes", {
        body: [nodeId],
      })
    );
  });
});
