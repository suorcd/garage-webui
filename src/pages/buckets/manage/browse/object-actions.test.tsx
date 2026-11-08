import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const { mutateMock, capturedOptions } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  capturedOptions: {} as {
    onSuccess?: (data: unknown) => void;
    onError?: (error: Error) => void;
  },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: {
      id: "bucket-1",
      keys: [{ permissions: { read: true, write: true, owner: false } }],
    },
    bucketName: "bucket-1",
  }),
}));

vi.mock("./hooks", () => ({
  useDeleteObject: (
    _bucket: string,
    options: {
      onSuccess?: (data: unknown) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    capturedOptions.onSuccess = options.onSuccess;
    capturedOptions.onError = options.onError;
    return { mutate: mutateMock, isPending: false };
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ObjectActions from "./object-actions";

const renderObjectActions = (objectKey = "dir/", end?: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <table>
        <tbody>
          <tr>
            <ObjectActions
              prefix=""
              object={{ objectKey, url: `/browse/bucket-1/${objectKey}` }}
              end={end}
            />
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>
  );
};

describe("ObjectActions Share item", () => {
  afterEach(cleanup);

  it("hides Share for directory rows", () => {
    renderObjectActions("dir/");

    expect(screen.queryByText("Share")).toBeNull();
  });

  it("shows Share for file rows", () => {
    renderObjectActions("file.txt");

    expect(screen.getByText("Share")).toBeTruthy();
  });

  it("opens the dropdown upward when end is set", () => {
    const { container } = renderObjectActions("dir/", true);

    expect(
      container.querySelector(".dropdown")?.classList.contains("dropdown-top")
    ).toBe(true);
  });

  it("opens the dropdown downward when end is not set", () => {
    const { container } = renderObjectActions("dir/");

    expect(
      container
        .querySelector(".dropdown")
        ?.classList.contains("dropdown-bottom")
    ).toBe(true);
  });
});

describe("ObjectActions recursive delete", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutateMock.mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("re-issues the delete while truncated and toasts the total", () => {
    renderObjectActions();

    capturedOptions.onSuccess?.({ deleted: 10000, truncated: true, errors: [] });

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith({
      key: "dir/",
      recursive: true,
    });
    expect(toast.success).not.toHaveBeenCalled();

    capturedOptions.onSuccess?.({ deleted: 500, errors: [] });

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Deleted 10500 objects!");
  });

  it("reports failures from earlier pages in the final toast", () => {
    renderObjectActions();

    capturedOptions.onSuccess?.({
      deleted: 9999,
      truncated: true,
      errors: [{ key: "dir/bad", code: "AccessDenied", message: "denied" }],
    });
    capturedOptions.onSuccess?.({ deleted: 1, errors: [] });

    expect(toast.warning).toHaveBeenCalledWith(
      "Deleted 10000 objects, but 1 failed (dir/bad)."
    );
  });

  it("reports the partial count when a later delete fails", () => {
    renderObjectActions();

    capturedOptions.onSuccess?.({ deleted: 10000, truncated: true, errors: [] });
    capturedOptions.onError?.(new Error("boom"));

    expect(toast.warning).toHaveBeenCalledWith(
      "Deleted 10000 objects, then the delete failed."
    );
  });

  it("does not report a partial count when the first delete fails", () => {
    renderObjectActions();

    capturedOptions.onError?.(new Error("boom"));

    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe("ObjectActions download", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("opens the download in a new tab without opener access", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <table>
          <tbody>
            <tr>
              <ObjectActions
                prefix=""
                object={{
                  objectKey: "file.txt",
                  url: "/browse/bucket-1/file.txt",
                }}
              />
            </tr>
          </tbody>
        </table>
      </QueryClientProvider>
    );

    await user.click(screen.getAllByRole("button")[0]);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("?dl=1"),
      "_blank",
      "noopener,noreferrer"
    );
  });
});
