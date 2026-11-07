import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateMock, keysData } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  keysData: [{ id: "key-1", name: "key one" }],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: { id: "bucket-1", keys: [] },
    refetch: vi.fn(),
    bucketName: "bucket-1",
  }),
}));

vi.mock("@/pages/keys/hooks", () => ({
  useKeys: () => ({
    data: keysData,
  }),
}));

vi.mock("../hooks", () => ({
  useAllowKey: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
}));

import AllowKeyDialog from "./allow-key-dialog";

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AllowKeyDialog />
    </QueryClientProvider>
  );
};

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  renderDialog();
  await user.click(screen.getByRole("button", { name: "Allow Key" }));
  await screen.findByText("key one");
};

describe("AllowKeyDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutateMock.mockClear();
  });

  it("submits a key when only a permission is selected", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByRole("checkbox", { name: "Read key one" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(mutateMock).toHaveBeenCalledWith([
      {
        keyId: "key-1",
        permissions: { read: true, write: false, owner: false },
      },
    ]);
  });

  it("blocks submit and shows an error when nothing is selected", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(mutateMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Select at least one key and permission.")
    ).toBeTruthy();
  });
});
