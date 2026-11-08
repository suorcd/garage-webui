import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  default: { post: postMock },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import CreateBucketDialog from "./create-bucket-dialog";

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateBucketDialog />
    </QueryClientProvider>
  );
};

const nameInput = (container: HTMLElement) =>
  container.querySelector('input[name="globalAlias"]') as HTMLInputElement;

const dialog = () => screen.getByRole("dialog") as HTMLDialogElement;

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Create Bucket" }));
};

describe("CreateBucketDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    postMock.mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("clears the form when reopened after cancel", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    await openDialog(user);

    await user.type(nameInput(container), "my-bucket");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openDialog(user);

    expect(nameInput(container).value).toBe("");
  });

  it("clears the form when reopened after a successful create", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    postMock.mockResolvedValue({ globalAlias: "my-bucket" });
    await openDialog(user);

    await user.type(nameInput(container), "my-bucket");
    const dlg = dialog();
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(dlg.open).toBe(false));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Bucket created!");

    await openDialog(user);
    expect(nameInput(container).value).toBe("");
  });
});
