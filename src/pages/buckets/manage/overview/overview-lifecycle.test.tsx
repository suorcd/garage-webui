import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGet, apiPut, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, put: apiPut, delete: apiDelete },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({ bucket: { id: "b1" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import LifecycleSection from "./overview-lifecycle";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LifecycleSection />
    </QueryClientProvider>
  );
}

describe("LifecycleSection", () => {
  afterEach(cleanup);

  beforeEach(() => {
    apiGet.mockReset();
    apiPut.mockReset();
    apiDelete.mockReset();
    apiGet.mockResolvedValue({
      rules: [
        {
          status: "Enabled",
          filter: { prefix: "logs/" },
          expiration: { days: 30 },
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
      "Lifecycle rules JSON"
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain("logs/"));
  });

  it("saves the edited rules", async () => {
    renderSection();

    const textarea = (await screen.findByLabelText(
      "Lifecycle rules JSON"
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain("logs/"));

    const next = {
      rules: [
        {
          status: "Enabled",
          filter: { prefix: "tmp/" },
          abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
        },
      ],
    };
    fireEvent.change(textarea, { target: { value: JSON.stringify(next) } });
    fireEvent.click(screen.getByRole("button", { name: "Save lifecycle" }));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/buckets/b1/lifecycle", {
        body: next,
      })
    );
  });

  it("removes the rules", async () => {
    renderSection();

    await screen.findByLabelText("Lifecycle rules JSON");
    fireEvent.click(screen.getByRole("button", { name: "Remove lifecycle" }));

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith("/buckets/b1/lifecycle")
    );
  });
});
