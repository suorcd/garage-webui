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
});
