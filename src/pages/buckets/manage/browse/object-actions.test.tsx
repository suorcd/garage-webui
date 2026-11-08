import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const renderObjectActions = () => {
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
              object={{ objectKey: "dir/", url: "/browse/bucket-1/dir/" }}
            />
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>
  );
};

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
