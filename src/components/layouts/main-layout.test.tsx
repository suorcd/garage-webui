import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page, { PageContextProvider } from "@/context/page-context";

const { authState, locationProbe } = vi.hoisted(() => ({
  authState: {
    isLoading: false,
    isEnabled: true,
    isAuthenticated: true,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  locationProbe: {
    pathname: "",
    search: "",
    action: "",
    navigate: (() => {}) as NavigateFunction,
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../containers/sidebar", () => ({
  default: () => <aside>Sidebar</aside>,
}));

import MainLayout from "./main-layout";

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  locationProbe.pathname = location.pathname;
  locationProbe.search = location.search;
  locationProbe.action = navigationType;
  locationProbe.navigate = navigate;
  return null;
}

function renderLayout(initialEntries: string[], initialIndex: number) {
  const result = render(
    <PageContextProvider>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route
              index
              element={
                <>
                  <Page title="Dashboard" />
                  <div>home content</div>
                </>
              }
            />
            <Route
              path="buckets"
              element={
                <>
                  <Page title="Buckets" />
                  <div>buckets content</div>
                </>
              }
            />
            <Route
              path="buckets/:id"
              element={
                <>
                  <Page title="Manage Bucket" prev="/buckets" />
                  <div>manage content</div>
                </>
              }
            />
            <Route path="plain" element={<div>plain content</div>} />
          </Route>
          <Route path="/auth/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </PageContextProvider>
  );

  return result;
}

describe("MainLayout", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.isLoading = false;
    authState.isEnabled = true;
    authState.isAuthenticated = true;
    authState.isError = false;
    authState.error = null;
    authState.refetch.mockClear();
  });

  it("carries the current path as returnTo when it redirects to login", () => {
    authState.isAuthenticated = false;
    renderLayout(["/buckets/abc"], 0);

    expect(locationProbe.pathname).toBe("/auth/login");
    expect(locationProbe.search).toBe("?returnTo=%2Fbuckets%2Fabc");
    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("shows an error state with retry when the status query fails", async () => {
    const user = userEvent.setup();
    authState.isError = true;
    authState.error = new Error("boom");
    renderLayout(["/buckets/abc"], 0);

    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(authState.refetch).toHaveBeenCalledTimes(1);
  });

  it("replaces the history entry when it redirects to login", async () => {
    authState.isAuthenticated = false;
    renderLayout(["/auth/login", "/buckets"], 1);

    expect(screen.getByText("login page")).toBeTruthy();
    expect(locationProbe.action).toBe("REPLACE");

    await act(async () => {
      locationProbe.navigate(-1);
    });

    expect(locationProbe.pathname).toBe("/auth/login");
    expect(locationProbe.action).toBe("POP");
  });

  it("fires one navigation when the Back button is clicked", async () => {
    const user = userEvent.setup();
    renderLayout(["/", "/buckets/abc"], 1);

    expect(screen.getByText("manage content")).toBeTruthy();

    const header = screen.getByRole("banner");
    const back = header.querySelector("a, button");
    expect(back).toBeTruthy();
    await user.click(back as HTMLElement);

    expect(locationProbe.pathname).toBe("/buckets");

    await act(async () => {
      locationProbe.navigate(-1);
    });

    expect(locationProbe.pathname).toBe("/");
  });

  it("keeps the menu button on a sub-page and opens the sidebar from it", async () => {
    const user = userEvent.setup();
    renderLayout(["/buckets/abc"], 0);

    const header = screen.getByRole("banner");
    const buttons = within(header).getAllByRole("button");
    expect(buttons).toHaveLength(2);

    await user.click(buttons[1]);

    expect(
      (screen.getByRole("checkbox") as HTMLInputElement).checked
    ).toBe(true);
  });

  it("shows an empty title before the page sets one", () => {
    renderLayout(["/plain"], 0);

    expect(screen.getByText("plain content")).toBeTruthy();
    expect(screen.getByRole("heading").textContent).toBe("");
  });

  it("shows the dashboard title on the dashboard page", () => {
    renderLayout(["/"], 0);

    expect(screen.getByRole("heading").textContent).toBe("Dashboard");
  });

  it("closes the sidebar when the route changes", async () => {
    const user = userEvent.setup();
    renderLayout(["/"], 0);

    const header = screen.getByRole("banner");
    const buttons = within(header).getAllByRole("button");
    await user.click(buttons[0]);

    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    await act(async () => {
      locationProbe.navigate("/buckets");
    });

    expect(toggle.checked).toBe(false);
  });

  it("names the back and sidebar buttons", () => {
    renderLayout(["/", "/buckets/abc"], 1);

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Back" })).toBeTruthy();
    expect(
      within(header).getByRole("button", { name: "Open sidebar" })
    ).toBeTruthy();
  });

  it("keeps the sidebar open when the layout re-renders", async () => {
    const user = userEvent.setup();
    const { rerender } = renderLayout(["/"], 0);

    const header = screen.getByRole("banner");
    const buttons = within(header).getAllByRole("button");
    await user.click(buttons[0]);

    expect(
      (screen.getByRole("checkbox") as HTMLInputElement).checked
    ).toBe(true);

    rerender(
      <PageContextProvider>
        <MemoryRouter initialEntries={["/"]} initialIndex={0}>
          <LocationProbe />
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route
                index
                element={
                  <>
                    <Page title="Dashboard" />
                    <div>home content</div>
                  </>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </PageContextProvider>
    );

    expect(
      (screen.getByRole("checkbox") as HTMLInputElement).checked
    ).toBe(true);
  });
});
