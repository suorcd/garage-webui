import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

const { bucketContext, updateBucket } = vi.hoisted(() => ({
  bucketContext: {
    bucket: {
      id: "b1",
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
      quotas: { maxSize: 1073741824, maxObjects: 100 } as {
        maxSize: number | null;
        maxObjects: number | null;
      },
    },
    bucketName: "b1",
    refetch: vi.fn(),
  },
  updateBucket: { mutate: vi.fn(), isPending: false, isSuccess: false },
}));

vi.mock("../context", () => ({
  useBucketContext: () => bucketContext,
}));

vi.mock("../hooks", () => ({
  useUpdateBucket: () => updateBucket,
}));

import QuotaSection from "./overview-quota";

function renderSection() {
  return render(<QuotaSection />);
}

function maxObjectsInput(container: HTMLElement) {
  return container.querySelector(
    'input[name="maxObjects"]'
  ) as HTMLInputElement;
}

function enabledToggle(container: HTMLElement) {
  return container.querySelector('input[name="enabled"]') as HTMLInputElement;
}

describe("QuotaSection", () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    vi.useFakeTimers();
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    updateBucket.mutate.mockClear();
    updateBucket.isPending = false;
    updateBucket.isSuccess = false;
    // The tests share one bucket object; a test that clears the quotas would
    // otherwise hide the inputs for every test after it.
    bucketContext.bucket.quotas = { maxSize: 1073741824, maxObjects: 100 };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    confirmSpy.mockRestore();
  });

  it("saves the quota when a value changes", () => {
    const { container } = renderSection();

    fireEvent.change(maxObjectsInput(container), {
      target: { value: "5" },
    });
    vi.advanceTimersByTime(500);

    expect(updateBucket.mutate).toHaveBeenCalledWith({
      quotas: { maxObjects: 5, maxSize: 1073741824 },
    });
  });

  it("shows Saving while the save is pending and Saved after it succeeds", () => {
    const { container, rerender } = renderSection();

    fireEvent.change(maxObjectsInput(container), {
      target: { value: "5" },
    });
    updateBucket.isPending = true;
    vi.advanceTimersByTime(500);
    rerender(<QuotaSection />);

    expect(screen.getByText("Saving")).toBeTruthy();

    updateBucket.isPending = false;
    updateBucket.isSuccess = true;
    rerender(<QuotaSection />);

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("asks for confirmation before it disables quotas, and keeps the quotas when the user cancels", () => {
    const { container } = renderSection();
    confirmSpy.mockReturnValue(false);

    fireEvent.click(enabledToggle(container));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Turn off quotas? This clears the quota limits on this bucket."
    );

    vi.advanceTimersByTime(500);

    expect(updateBucket.mutate).not.toHaveBeenCalled();
    expect(enabledToggle(container).checked).toBe(true);
  });

  it("saves null quotas when the user confirms the disable", () => {
    const { container } = renderSection();

    fireEvent.click(enabledToggle(container));
    vi.advanceTimersByTime(500);

    expect(confirmSpy).toHaveBeenCalled();
    expect(updateBucket.mutate).toHaveBeenCalledWith({
      quotas: { maxObjects: null, maxSize: null },
    });
  });

  it("keeps in-progress typing when the bucket data refreshes", () => {
    const { container, rerender } = renderSection();

    fireEvent.change(maxObjectsInput(container), {
      target: { value: "5" },
    });

    bucketContext.bucket = {
      ...bucketContext.bucket,
      quotas: { maxSize: null, maxObjects: null },
    };
    rerender(<QuotaSection />);

    const input = maxObjectsInput(container);
    expect(input).not.toBeNull();
    expect(input.value).toBe("5");
  });

  it("saves the pending edit when the section unmounts", () => {
    const { container, unmount } = renderSection();

    fireEvent.change(maxObjectsInput(container), {
      target: { value: "42" },
    });
    unmount();

    expect(updateBucket.mutate).toHaveBeenCalledWith({
      quotas: { maxObjects: 42, maxSize: 1073741824 },
    });
  });

  it("adopts a new server value after a save lands", () => {
    const { container, rerender } = renderSection();

    fireEvent.change(maxObjectsInput(container), {
      target: { value: "7" },
    });

    updateBucket.isSuccess = true;
    rerender(<QuotaSection />);
    updateBucket.isSuccess = false;

    bucketContext.bucket = {
      ...bucketContext.bucket,
      quotas: { maxSize: null, maxObjects: 9 },
    };
    rerender(<QuotaSection />);

    expect(maxObjectsInput(container).value).toBe("9");
  });
});
