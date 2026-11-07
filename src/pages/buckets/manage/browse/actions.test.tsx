import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: { id: "bucket-1" },
    bucketName: "bucket-1",
  }),
}));

vi.mock("./hooks", () => ({
  usePutObject: () => ({ mutate: mutateMock, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import Actions from "./actions";

const renderActions = (canWrite: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Actions prefix="" canWrite={canWrite} />
    </QueryClientProvider>
  );
};

describe("Actions", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutateMock.mockClear();
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
});
