import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mutateMock,
  mutateAsyncMock,
  toastSuccess,
  toastError,
  toastWarning,
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: { id: "bucket-1" },
    bucketName: "bucket-1",
  }),
}));

vi.mock("./hooks", () => ({
  usePutObject: () => ({
    mutate: mutateMock,
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, warning: toastWarning },
}));

import Actions from "./actions";

const renderActions = (canWrite: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  const result = render(
    <QueryClientProvider client={queryClient}>
      <Actions prefix="" canWrite={canWrite} />
    </QueryClientProvider>
  );

  return { ...result, queryClient, invalidateSpy };
};

const pickFiles = (files: File[]) => {
  return vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", {
        value: files,
        configurable: true,
      });
      this.dispatchEvent(new Event("change"));
    });
};

const testFiles = (names: string[]) =>
  names.map((name) => new File(["content"], name));

describe("Actions", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutateMock.mockClear();
    mutateAsyncMock.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastWarning.mockClear();
    mutateAsyncMock.mockResolvedValue(undefined);
  });

  it("disables upload and folder buttons without write access", () => {
    renderActions(false);

    const upload = screen.getByTitle(
      "A key with write access is required to upload objects."
    ) as HTMLButtonElement;
    const folder = screen.getByTitle(
      "A key with write access is required to create folders."
    ) as HTMLButtonElement;

    expect(upload.disabled).toBe(true);
    expect(folder.disabled).toBe(true);
  });

  it("enables upload and folder buttons with write access", () => {
    renderActions(true);

    const upload = screen.getByTitle("Upload File") as HTMLButtonElement;
    const folder = screen.getByTitle("Create Folder") as HTMLButtonElement;

    expect(upload.disabled).toBe(false);
    expect(folder.disabled).toBe(false);
  });

  it("uploads selected files with one summary toast and one list refresh", async () => {
    const { invalidateSpy } = renderActions(true);
    const files = testFiles(["a.txt", "b.txt", "c.txt"]);
    const clickSpy = pickFiles(files);

    fireEvent.click(screen.getByTitle("Upload File"));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith("Uploaded 3 files.");
    expect(mutateAsyncMock).toHaveBeenCalledTimes(3);
    expect(mutateAsyncMock).toHaveBeenNthCalledWith(1, {
      key: "a.txt",
      file: files[0],
    });
    expect(mutateAsyncMock).toHaveBeenNthCalledWith(3, {
      key: "c.txt",
      file: files[2],
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["browse", "bucket-1"],
    });
    clickSpy.mockRestore();
  });

  it("names each failed file in one summary toast", async () => {
    mutateAsyncMock.mockImplementation(({ key }: { key: string }) =>
      key === "b.txt"
        ? Promise.reject(new Error("forbidden"))
        : Promise.resolve(undefined)
    );
    const { invalidateSpy } = renderActions(true);
    const clickSpy = pickFiles(testFiles(["a.txt", "b.txt", "c.txt"]));

    fireEvent.click(screen.getByTitle("Upload File"));

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastWarning).toHaveBeenCalledWith(
      "Uploaded 2 of 3 files. Failed: b.txt (forbidden)."
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("shows one error toast that names the failed files when every upload fails", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("forbidden"));
    const { invalidateSpy } = renderActions(true);
    const clickSpy = pickFiles(testFiles(["a.txt", "b.txt"]));

    fireEvent.click(screen.getByTitle("Upload File"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      "Upload failed: a.txt (forbidden), b.txt (forbidden)."
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("disables the upload button while uploads run", async () => {
    let resolveFirst!: (value: unknown) => void;
    mutateAsyncMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue(undefined);
    renderActions(true);
    const clickSpy = pickFiles(testFiles(["a.txt", "b.txt"]));

    fireEvent.click(screen.getByTitle("Upload File"));

    const upload = screen.getByTitle("Upload File") as HTMLButtonElement;
    await waitFor(() => expect(upload.disabled).toBe(true));
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);

    resolveFirst(undefined);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(upload.disabled).toBe(false);
    clickSpy.mockRestore();
  });

  it("clears the folder name when reopened after cancel", async () => {
    const user = userEvent.setup();
    const { container } = renderActions(true);

    await user.click(screen.getByTitle("Create Folder"));
    const name = container.querySelector(
      'input[name="name"]'
    ) as HTMLInputElement;
    await user.type(name, "photos");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByTitle("Create Folder"));
    expect(
      (container.querySelector('input[name="name"]') as HTMLInputElement)
        .value
    ).toBe("");
  });

  it("syncs open state when the native dialog closes", async () => {
    const user = userEvent.setup();
    renderActions(true);

    await user.click(screen.getByTitle("Create Folder"));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getByText("close")).toBeTruthy();

    fireEvent(dialog, new Event("close"));
    expect(dialog.open).toBe(false);

    await user.click(screen.getByTitle("Create Folder"));
    expect(
      (screen.getByRole("dialog") as HTMLDialogElement).open
    ).toBe(true);
  });

  it("names the upload and create-folder buttons", () => {
    renderActions(true);

    expect(
      screen.getByRole("button", { name: "Upload file" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create folder" })
    ).toBeTruthy();
  });
});
