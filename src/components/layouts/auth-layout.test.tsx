import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, locationProbe } = vi.hoisted(() => ({
  authState: {
    isLoading: false,
    isEnabled: true,
    isAuthenticated: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  locationProbe: {
    pathname: "",
    search: "",
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

import AuthLayout from "./auth-layout";

function LocationProbe() {
  const location = useLocation();
  locationProbe.pathname = location.pathname;
  locationProbe.search = location.search;
  return null;
}

function renderAuthLayout(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/auth" element={<AuthLayout />}>
          <Route path="login" element={<div>login page</div>} />
        </Route>
        <Route path="/" element={<div>home content</div>} />
        <Route path="/buckets/:id" element={<div>manage content</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AuthLayout", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.isLoading = false;
    authState.isEnabled = true;
    authState.isAuthenticated = false;
    authState.isError = false;
    authState.error = null;
    authState.refetch.mockClear();
  });

  it("shows the login form when unauthenticated", () => {
    renderAuthLayout(["/auth/login"]);

    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("redirects an authenticated user to the returnTo path", () => {
    authState.isAuthenticated = true;
    renderAuthLayout(["/auth/login?returnTo=%2Fbuckets%2Fabc"]);

    expect(screen.getByText("manage content")).toBeTruthy();
    expect(locationProbe.pathname).toBe("/buckets/abc");
  });

  it("redirects an authenticated user to the dashboard without returnTo", () => {
    authState.isAuthenticated = true;
    renderAuthLayout(["/auth/login"]);

    expect(screen.getByText("home content")).toBeTruthy();
    expect(locationProbe.pathname).toBe("/");
  });

  it("ignores a returnTo that points back at login", () => {
    authState.isAuthenticated = true;
    renderAuthLayout(["/auth/login?returnTo=%2Fauth%2Flogin"]);

    expect(screen.getByText("home content")).toBeTruthy();
    expect(locationProbe.pathname).toBe("/");
  });

  it("shows an error state with retry when the status query fails", async () => {
    const user = userEvent.setup();
    authState.isError = true;
    authState.error = new Error("boom");
    renderAuthLayout(["/auth/login"]);

    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(authState.refetch).toHaveBeenCalledTimes(1);
  });
});
