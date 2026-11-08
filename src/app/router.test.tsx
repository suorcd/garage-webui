import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoading: false,
    isEnabled: false,
    isAuthenticated: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

async function renderRouter(Router: React.ComponentType) {
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { PageContextProvider } = await import("@/context/page-context");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageContextProvider>
        <Router />
      </PageContextProvider>
    </QueryClientProvider>
  );
}

describe("Router", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.resetModules();
  });

  it("renders the 404 page for an unknown URL", async () => {
    window.history.pushState({}, "", "/no-such-page");
    const { default: Router } = await import("@/app/router");

    await renderRouter(Router);

    await waitFor(() =>
      expect(screen.getByText("Page not found")).toBeTruthy()
    );
  });

  it("shows a loading indicator while a lazy page loads", async () => {
    vi.doMock("@/pages/home/page", () => ({
      default: () => {
        throw new Promise(() => {});
      },
    }));
    window.history.pushState({}, "", "/");
    const { default: Router } = await import("@/app/router");

    await renderRouter(Router);

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  });
});
