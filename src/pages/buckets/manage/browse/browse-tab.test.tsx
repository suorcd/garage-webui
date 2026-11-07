import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

type TestKey = {
  permissions: {
    read: boolean;
    write: boolean;
    owner: boolean;
  };
};

const { bucketState } = vi.hoisted(() => ({
  bucketState: { keys: [] as TestKey[] },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({ bucket: bucketState, bucketName: "" }),
}));

vi.mock("./object-list", () => ({
  default: () => <div>Object list</div>,
}));

vi.mock("./object-list-navigator", () => ({
  default: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("./actions", () => ({
  default: ({ canWrite }: { canWrite: boolean }) => (
    <div>canWrite: {String(canWrite)}</div>
  ),
}));

vi.mock("./share-dialog", () => ({
  default: () => null,
}));

import BrowseTab from "./browse-tab";

const renderTab = () => {
  return render(
    <MemoryRouter>
      <BrowseTab />
    </MemoryRouter>
  );
};

describe("BrowseTab", () => {
  afterEach(cleanup);

  it("shows a create-key hint when the bucket has no keys", () => {
    bucketState.keys = [];

    renderTab();

    expect(screen.getByText(/This bucket has no keys/)).toBeTruthy();
  });

  it("shows a read access hint when no key has read access", () => {
    bucketState.keys = [
      { permissions: { read: false, write: true, owner: false } },
    ];

    renderTab();

    expect(screen.getByText(/No key has read access/)).toBeTruthy();
  });

  it("keeps browse available and disables write actions for a read-only key", () => {
    bucketState.keys = [
      { permissions: { read: true, write: false, owner: false } },
    ];

    renderTab();

    expect(
      screen.getByText(/A key with write access is required/)
    ).toBeTruthy();
    expect(screen.getByText("canWrite: false")).toBeTruthy();
  });

  it("allows write actions when a key has write access", () => {
    bucketState.keys = [
      { permissions: { read: true, write: true, owner: false } },
    ];

    renderTab();

    expect(screen.queryByText(/A key with write access is required/)).toBeNull();
    expect(screen.getByText("canWrite: true")).toBeTruthy();
  });
});
