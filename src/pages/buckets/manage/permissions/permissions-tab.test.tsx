import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const { state, keysData, mutateMock } = vi.hoisted(() => {
  const keysData = [
    {
      accessKeyId: "GK11111111111111111111111111111111",
      name: "key one",
      permissions: { read: true, write: false, owner: false },
      bucketLocalAliases: ["alias-one"],
    },
    {
      accessKeyId: "GK22222222222222222222222222222222",
      name: "key two",
      permissions: { read: true, write: true, owner: true },
      bucketLocalAliases: [],
    },
  ];

  return {
    state: {
      bucket: { id: "bucket-1", keys: keysData },
    },
    keysData,
    mutateMock: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: state.bucket,
    refetch: vi.fn(),
    bucketName: "bucket-1",
  }),
}));

vi.mock("@/pages/keys/hooks", () => ({
  useKeys: () => ({
    data: [],
  }),
}));

vi.mock("../hooks", () => ({
  useDenyKey: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
  useAllowKey: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
}));

import PermissionsTab from "./permissions-tab";

const renderTab = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PermissionsTab />
    </QueryClientProvider>
  );
};

describe("PermissionsTab", () => {
  afterEach(() => {
    cleanup();
    state.bucket = { id: "bucket-1", keys: keysData };
  });

  it("shows an empty row when the bucket has no keys", () => {
    state.bucket = { id: "bucket-1", keys: [] };

    renderTab();

    expect(screen.getByText("No keys allowed yet")).toBeTruthy();
  });

  it("shows each permission as a disabled read-only checkbox with a label", () => {
    renderTab();

    const read = screen.getByRole("checkbox", {
      name: "Read permission for key one",
    }) as HTMLInputElement;
    const write = screen.getByRole("checkbox", {
      name: "Write permission for key one",
    }) as HTMLInputElement;
    const owner = screen.getByRole("checkbox", {
      name: "Owner permission for key two",
    }) as HTMLInputElement;

    expect(read.checked).toBe(true);
    expect(read.disabled).toBe(true);
    expect(read.readOnly).toBe(true);
    expect(write.checked).toBe(false);
    expect(write.disabled).toBe(true);
    expect(write.readOnly).toBe(true);
    expect(owner.checked).toBe(true);
    expect(owner.disabled).toBe(true);
    expect(owner.readOnly).toBe(true);
  });

  it("renders rows without React key or controlled-input warnings", () => {
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });

    try {
      renderTab();
    } finally {
      spy.mockRestore();
    }

    expect(errors.some((msg) => /unique "key" prop/.test(msg))).toBe(false);
    expect(
      errors.some((msg) => /without an `onChange` handler/.test(msg))
    ).toBe(false);
  });

  it("names the remove button for each key", () => {
    renderTab();

    expect(
      screen.getByRole("button", { name: "Remove key key one" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove key key two" })
    ).toBeTruthy();
  });
});
