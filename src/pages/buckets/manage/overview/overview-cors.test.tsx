import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGet, apiPut, apiDelete, bucketState } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  bucketState: {
    id: "b1",
    keys: [
      { permissions: { read: true, write: true, owner: false } },
    ] as { permissions: { read: boolean; write: boolean; owner: boolean } }[],
  },
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, put: apiPut, delete: apiDelete },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({ bucket: bucketState }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import CORSSection from "./overview-cors";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CORSSection />
    </QueryClientProvider>
  );
}

describe("CORSSection", () => {
  afterEach(cleanup);

  beforeEach(() => {
    apiGet.mockReset();
    apiPut.mockReset();
    apiDelete.mockReset();
    bucketState.keys = [
      { permissions: { read: true, write: true, owner: false } },
    ];
    apiGet.mockResolvedValue({
      rules: [
        {
          allowedHeaders: ["*"],
          allowedMethods: ["GET"],
          allowedOrigins: ["https://example.com"],
        },
      ],
    });
    apiPut.mockResolvedValue(undefined);
    apiDelete.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("loads the current rules", async () => {
    renderSection();

    const textarea = (await screen.findByLabelText(
      "CORS rules JSON"
    )) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(textarea.value).toContain("https://example.com")
    );
  });

  it("saves the edited rules", async () => {
    renderSection();

    const textarea = (await screen.findByLabelText(
      "CORS rules JSON"
    )) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(textarea.value).toContain("https://example.com")
    );

    const next = {
      rules: [
        {
          allowedHeaders: ["*"],
          allowedMethods: ["GET", "PUT"],
          allowedOrigins: ["https://next.example.com"],
        },
      ],
    };
    fireEvent.change(textarea, { target: { value: JSON.stringify(next) } });
    fireEvent.click(screen.getByRole("button", { name: "Save CORS" }));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/buckets/b1/cors", {
        body: next,
      })
    );
  });

  it("removes the rules", async () => {
    renderSection();

    await screen.findByLabelText("CORS rules JSON");
    fireEvent.click(screen.getByRole("button", { name: "Remove CORS" }));

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith("/buckets/b1/cors")
    );
  });

  it("skips the query and shows a note when the bucket has no read key", () => {
    bucketState.keys = [];
    renderSection();

    expect(apiGet).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Grant read access to a key to view CORS rules/)
    ).toBeTruthy();
  });

  it("disables Save CORS and Remove CORS when the bucket has no write key", async () => {
    bucketState.keys = [
      { permissions: { read: true, write: false, owner: false } },
    ];
    renderSection();

    await screen.findByLabelText("CORS rules JSON");
    expect(
      (screen.getByRole("button", { name: "Save CORS" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Remove CORS" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
