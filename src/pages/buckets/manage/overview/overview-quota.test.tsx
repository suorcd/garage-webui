import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateMock, bucketData } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  bucketData: {
    id: "b-1",
    globalAliases: [] as string[],
    localAliases: [],
    websiteAccess: false,
    keys: [],
    objects: 0,
    bytes: 0,
    unfinishedUploads: 0,
    unfinishedMultipartUploads: 0,
    unfinishedMultipartUploadParts: 0,
    unfinishedMultipartUploadBytes: 0,
    quotas: { maxSize: null, maxObjects: null },
  },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: bucketData,
    refetch: vi.fn(),
    bucketName: "b-1",
  }),
}));

vi.mock("../hooks", () => ({
  useUpdateBucket: () => ({ mutate: mutateMock, isPending: false }),
}));

import QuotaSection from "./overview-quota";

const renderSection = () => render(<QuotaSection />);

// The quota inputs only render while quotas are enabled, and flipping the
// toggle autosaves once. Wait for that save, then clear the mock so each
// test starts from a clean slate.
const enableQuotas = async (user: ReturnType<typeof userEvent.setup>) => {
  renderSection();
  await user.click(screen.getByRole("checkbox", { name: "Enabled" }));

  await waitFor(
    () =>
      expect(mutateMock).toHaveBeenCalledWith({
        quotas: { maxObjects: null, maxSize: null },
      }),
    { timeout: 5000 }
  );
  mutateMock.mockClear();
};

// jsdom drops "-" while typing into a number input keystroke by keystroke,
// so set the value with a change event instead.
const setQuota = (index: number, value: string) => {
  const inputs = screen.getAllByRole("spinbutton");
  fireEvent.change(inputs[index], { target: { value } });
};

const waitPastDebounce = async () =>
  new Promise((resolve) => setTimeout(resolve, 800));

describe("QuotaSection", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutateMock.mockClear();
  });

  it("does not save a negative max objects value, and shows an error", async () => {
    const user = userEvent.setup();
    await enableQuotas(user);

    setQuota(0, "-5");

    await waitPastDebounce();

    expect(mutateMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Max objects must be greater than 0")
    ).toBeTruthy();
  }, 15000);

  it("does not save a negative max size value, and shows an error", async () => {
    const user = userEvent.setup();
    await enableQuotas(user);

    setQuota(1, "-5");

    await waitPastDebounce();

    expect(mutateMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Max size must be greater than 0")
    ).toBeTruthy();
  }, 15000);

  it("saves a positive max objects value", async () => {
    const user = userEvent.setup();
    await enableQuotas(user);

    setQuota(0, "5");

    await waitFor(
      () =>
        expect(mutateMock).toHaveBeenCalledWith({
          quotas: { maxObjects: 5, maxSize: null },
        }),
      { timeout: 5000 }
    );
  }, 15000);

  it("clears the quota when quotas are switched off with an invalid value", async () => {
    const user = userEvent.setup();
    await enableQuotas(user);

    setQuota(0, "-5");

    expect(
      await screen.findByText("Max objects must be greater than 0")
    ).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));

    await waitFor(
      () =>
        expect(mutateMock).toHaveBeenCalledWith({
          quotas: { maxObjects: null, maxSize: null },
        }),
      { timeout: 5000 }
    );
  }, 15000);
});
