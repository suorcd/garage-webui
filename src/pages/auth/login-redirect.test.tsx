import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

// The status query answers "unauthenticated" first and only reports the
// session as live after a delay, so a redirect that runs before the refetch
// resolves is visible here.
const { apiGet, apiPost, visited } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  visited: [] as string[],
}));

vi.mock("@/lib/api", () => ({
  default: { get: apiGet, post: apiPost },
  APIError: class APIError extends Error {
    status = 400;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import AuthLayout from "@/components/layouts/auth-layout";
import MainLayout from "@/components/layouts/main-layout";
import LoginPage from "@/pages/auth/login";

function LocationProbe() {
  const location = useLocation();

  useEffect(() => {
    if (visited[visited.length - 1] !== location.pathname) {
      visited.push(location.pathname);
    }
  }, [location.pathname]);

  return null;
}

describe("post-login redirect", () => {
  it("goes to the target page without landing back on the login page", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    apiGet.mockImplementation(async () => {
      statusCalls += 1;
      if (statusCalls === 1) {
        return { enabled: true, authenticated: false };
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { enabled: true, authenticated: true };
    });
    apiPost.mockResolvedValue({});

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/auth/login?returnTo=%2Fbuckets%2Fabc"]}>
          <LocationProbe />
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<div>home content</div>} />
              <Route path="/buckets/:id" element={<div>manage content</div>} />
            </Route>
            <Route path="/auth" element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Enter your username")).toBeTruthy()
    );

    await user.type(
      screen.getByPlaceholderText("Enter your username"),
      "admin"
    );
    await user.type(screen.getByPlaceholderText("Enter your password"), "pw");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(
      () => expect(screen.getByText("manage content")).toBeTruthy(),
      { timeout: 3000 }
    );

    expect(visited).toEqual(["/auth/login", "/buckets/abc"]);
  });
});
