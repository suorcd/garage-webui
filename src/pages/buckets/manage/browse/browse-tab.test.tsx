import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
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
  default: ({
    prefix,
    onPrefixChange,
  }: {
    prefix: string;
    onPrefixChange: (prefix: string) => void;
  }) => (
    <div>
      <span data-testid="object-list-prefix">{prefix}</span>
      <button onClick={() => onPrefixChange("photos/")}>open photos</button>
    </div>
  ),
}));

vi.mock("./object-list-navigator", () => ({
  default: ({
    actions,
    setCurPrefix,
  }: {
    actions: ReactNode;
    setCurPrefix: (index: number) => void;
  }) => (
    <div>
      <button onClick={() => setCurPrefix(-1)}>go home</button>
      {actions}
    </div>
  ),
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

const LocationProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="location-search">{location.search}</span>
      <button onClick={() => navigate(-1)}>go back</button>
      <button onClick={() => navigate(1)}>go forward</button>
      <button onClick={() => navigate("?prefix=x/")}>go to x</button>
    </div>
  );
};

const renderTab = (initialEntries: string[] = ["/"]) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <BrowseTab />
    </MemoryRouter>
  );
};

const readKey = {
  permissions: { read: true, write: true, owner: false },
};

const listingPrefix = () =>
  screen.getByTestId("object-list-prefix").textContent ?? "";

const locationSearch = () =>
  screen.getByTestId("location-search").textContent ?? "";

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

  it("reads the prefix from the URL on mount", () => {
    bucketState.keys = [readKey];

    renderTab(["/?prefix=a/b/"]);

    expect(listingPrefix()).toBe("a/b/");
  });

  it("moves the listing to the prefix in the URL on browser Back and Forward", () => {
    bucketState.keys = [readKey];

    renderTab();

    fireEvent.click(screen.getByText("open photos"));
    expect(listingPrefix()).toBe("photos/");
    expect(locationSearch()).toBe("?prefix=photos%2F");

    fireEvent.click(screen.getByText("go back"));
    expect(listingPrefix()).toBe("");
    expect(locationSearch()).toBe("");

    fireEvent.click(screen.getByText("go forward"));
    expect(listingPrefix()).toBe("photos/");
    expect(locationSearch()).toBe("?prefix=photos%2F");
  });

  it("moves the listing when the URL changes to a prefix never visited in-app", () => {
    bucketState.keys = [readKey];

    renderTab(["/?prefix=a/b/"]);
    expect(listingPrefix()).toBe("a/b/");

    fireEvent.click(screen.getByText("go to x"));
    expect(listingPrefix()).toBe("x/");
  });

  it("writes the URL when in-app navigation moves to the root", () => {
    bucketState.keys = [readKey];

    renderTab();

    fireEvent.click(screen.getByText("open photos"));
    expect(listingPrefix()).toBe("photos/");

    fireEvent.click(screen.getByText("go home"));
    expect(listingPrefix()).toBe("");
    expect(locationSearch()).toBe("");
  });

  it("does not write a prefix param when the prefix is empty", () => {
    bucketState.keys = [readKey];

    renderTab();

    expect(locationSearch()).toBe("");
  });
});
