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

import CreateKeyDialog from "./create-key-dialog";

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateKeyDialog />
    </QueryClientProvider>
  );
};

const inputByName = (container: HTMLElement, name: string) =>
  container.querySelector(`input[name="${name}"]`) as HTMLInputElement;

const dialog = () => screen.getByRole("dialog") as HTMLDialogElement;

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Create Key" }));
};

describe("CreateKeyDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    postMock.mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("clears the form when reopened after cancel", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    await openDialog(user);

    await user.type(inputByName(container, "name"), "my-key");
    await user.click(
      screen.getByRole("checkbox", { name: "Import existing" })
    );
    await user.type(inputByName(container, "accessKeyId"), "AKIDEXAMPLE");
    await user.type(
      inputByName(container, "secretAccessKey"),
      "SECRETEXAMPLE"
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openDialog(user);

    expect(inputByName(container, "name").value).toBe("");
    expect(
      screen.getByRole("checkbox", { name: "Import existing" }) as HTMLInputElement
    ).toHaveProperty("checked", false);
  });

  it("clears the import fields when the import toggle is switched off", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    await openDialog(user);

    const toggle = screen.getByRole("checkbox", { name: "Import existing" });
    await user.click(toggle);
    await user.type(inputByName(container, "accessKeyId"), "AKIDEXAMPLE");
    await user.type(
      inputByName(container, "secretAccessKey"),
      "SECRETEXAMPLE"
    );

    await user.click(toggle);
    await user.click(toggle);

    expect(inputByName(container, "accessKeyId").value).toBe("");
    expect(inputByName(container, "secretAccessKey").value).toBe("");
  });

  it("shows the new secret in the dialog after a key is created", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    postMock.mockResolvedValue({
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "SECRETEXAMPLE",
      name: "my-key",
    });
    await openDialog(user);

    await user.type(inputByName(container, "name"), "my-key");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByText("SECRETEXAMPLE");
    expect(dialog().open).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/v2/CreateKey", {
      body: { name: "my-key" },
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Key created!");
  });

  it("closes and resets after Done on the created-key view", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    postMock.mockResolvedValue({
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "SECRETEXAMPLE",
      name: "my-key",
    });
    await openDialog(user);

    await user.type(inputByName(container, "name"), "my-key");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("SECRETEXAMPLE");
    const dlg = dialog();
    expect(dlg.open).toBe(true);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(dlg.open).toBe(false);

    await openDialog(user);
    expect(inputByName(container, "name").value).toBe("");
  });

  it("toasts Key imported and closes when an import succeeds", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    postMock.mockResolvedValue({
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "SECRETEXAMPLE",
      name: "my-key",
    });
    await openDialog(user);

    await user.type(inputByName(container, "name"), "my-key");
    await user.click(
      screen.getByRole("checkbox", { name: "Import existing" })
    );
    await user.type(inputByName(container, "accessKeyId"), "AKIDEXAMPLE");
    await user.type(
      inputByName(container, "secretAccessKey"),
      "SECRETEXAMPLE"
    );
    const dlg = dialog();
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(dlg.open).toBe(false));
    expect(postMock).toHaveBeenCalledWith("/v2/ImportKey", {
      body: {
        name: "my-key",
        isImport: true,
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "SECRETEXAMPLE",
      },
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Key imported!");
  });

  it("masks the imported secret field", async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();
    await openDialog(user);

    await user.click(
      screen.getByRole("checkbox", { name: "Import existing" })
    );

    const secret = inputByName(container, "secretAccessKey");
    expect(secret.type).toBe("password");
    expect(secret.autocomplete).toBe("off");
  });

  it("disables Cancel while the create request is in flight", async () => {
    postMock.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = renderDialog();
    await openDialog(user);

    await user.type(inputByName(container, "name"), "my-key");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );
  });
});
