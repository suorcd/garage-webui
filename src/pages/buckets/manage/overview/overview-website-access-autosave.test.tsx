import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
      websiteAccess: true,
      websiteConfig: {
        indexDocument: "index.html",
        errorDocument: "error/400.html",
      },
      keys: [],
      objects: 0,
      bytes: 0,
      unfinishedUploads: 0,
      unfinishedMultipartUploads: 0,
      unfinishedMultipartUploadParts: 0,
      unfinishedMultipartUploadBytes: 0,
      quotas: { maxSize: null, maxObjects: null },
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

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({ data: undefined }),
}));

import WebsiteAccessSection from "./overview-website-access";

function renderSection() {
  return render(
    <MemoryRouter>
      <WebsiteAccessSection />
    </MemoryRouter>
  );
}

function indexDocumentInput(container: HTMLElement) {
  return container.querySelector(
    'input[name="websiteConfig.indexDocument"]'
  ) as HTMLInputElement;
}

function websiteAccessToggle(container: HTMLElement) {
  return container.querySelector(
    'input[name="websiteAccess"]'
  ) as HTMLInputElement;
}

describe("WebsiteAccessSection", () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    vi.useFakeTimers();
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    updateBucket.mutate.mockClear();
    updateBucket.isPending = false;
    updateBucket.isSuccess = false;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    confirmSpy.mockRestore();
  });

  it("saves the website settings when a value changes", () => {
    const { container } = renderSection();

    fireEvent.change(indexDocumentInput(container), {
      target: { value: "home.html" },
    });
    vi.advanceTimersByTime(500);

    expect(updateBucket.mutate).toHaveBeenCalledWith({
      websiteAccess: {
        enabled: true,
        indexDocument: "home.html",
        errorDocument: "error/400.html",
      },
    });
  });

  it("shows Saving while the save is pending and Saved after it succeeds", () => {
    const { container, rerender } = renderSection();

    fireEvent.change(indexDocumentInput(container), {
      target: { value: "home.html" },
    });
    updateBucket.isPending = true;
    vi.advanceTimersByTime(500);
    rerender(
      <MemoryRouter>
        <WebsiteAccessSection />
      </MemoryRouter>
    );

    expect(screen.getByText("Saving")).toBeTruthy();

    updateBucket.isPending = false;
    updateBucket.isSuccess = true;
    rerender(
      <MemoryRouter>
        <WebsiteAccessSection />
      </MemoryRouter>
    );

    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("asks for confirmation before it disables website access, and keeps access when the user cancels", () => {
    const { container } = renderSection();
    confirmSpy.mockReturnValue(false);

    fireEvent.click(websiteAccessToggle(container));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Turn off website access? This stops the bucket website."
    );

    vi.advanceTimersByTime(500);

    expect(updateBucket.mutate).not.toHaveBeenCalled();
    expect(websiteAccessToggle(container).checked).toBe(true);
  });

  it("saves website access disabled when the user confirms the disable", () => {
    const { container } = renderSection();

    fireEvent.click(websiteAccessToggle(container));
    vi.advanceTimersByTime(500);

    expect(confirmSpy).toHaveBeenCalled();
    expect(updateBucket.mutate).toHaveBeenCalledWith({
      websiteAccess: { enabled: false },
    });
  });

  it("keeps in-progress typing when the bucket data refreshes", () => {
    const { container, rerender } = renderSection();

    fireEvent.change(indexDocumentInput(container), {
      target: { value: "home.html" },
    });

    bucketContext.bucket = {
      ...bucketContext.bucket,
      websiteAccess: false,
      websiteConfig: {
        indexDocument: "index.html",
        errorDocument: "error/400.html",
      },
    };
    rerender(
      <MemoryRouter>
        <WebsiteAccessSection />
      </MemoryRouter>
    );

    const input = indexDocumentInput(container);
    expect(input).not.toBeNull();
    expect(input.value).toBe("home.html");
  });
});
