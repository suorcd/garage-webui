import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiPost, toastError } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    default: { get: vi.fn(), post: apiPost },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: toastError, warning: vi.fn() },
}));

import LoginPage from "./login";
import { APIError } from "@/lib/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderLogin(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/" element={<div>home content</div>} />
          <Route path="/buckets/:id" element={<div>manage content</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  username = "admin",
  password = "secret",
) {
  await user.type(screen.getByPlaceholderText("Enter your username"), username);
  await user.type(screen.getByPlaceholderText("Enter your password"), password);
  await user.click(screen.getByRole("button", { name: "Login" }));
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("disables the login button while logging in and posts once for a double click", async () => {
    const user = userEvent.setup();
    const login = deferred<unknown>();
    apiPost.mockReturnValueOnce(login.promise);
    renderLogin(["/auth/login?returnTo=%2Fbuckets%2Fabc"]);

    await user.type(screen.getByPlaceholderText("Enter your username"), "admin");
    await user.type(screen.getByPlaceholderText("Enter your password"), "secret");
    const button = screen.getByRole("button", {
      name: "Login",
    }) as HTMLButtonElement;

    await user.click(button);

    expect(button.disabled).toBe(true);

    await user.click(button);

    login.resolve({});
    await waitFor(() => expect(screen.getByText("manage content")).toBeTruthy());

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith("/auth/login", {
      body: { username: "admin", password: "secret" },
    });
  });

  it("does not post twice when Enter is pressed while logging in", async () => {
    const user = userEvent.setup();
    const login = deferred<unknown>();
    apiPost.mockReturnValueOnce(login.promise);
    renderLogin(["/auth/login"]);

    await user.type(screen.getByPlaceholderText("Enter your username"), "admin");
    await user.type(screen.getByPlaceholderText("Enter your password"), "secret");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await user.keyboard("{Enter}");

    login.resolve({});
    await waitFor(() => expect(screen.getByText("home content")).toBeTruthy());

    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("returns to the dashboard when no returnTo is given", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce({});
    renderLogin(["/auth/login"]);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText("home content")).toBeTruthy());
  });

  it("shows an error toast and re-enables the button when login fails", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new Error("bad password"));
    renderLogin(["/auth/login"]);

    await fillAndSubmit(user);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(
      (screen.getByRole("button", { name: "Login" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.queryByText("home content")).toBeNull();
  });

  it("disables the login button until the lockout ends", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(
      new APIError("too many login attempts", 429, 30)
    );
    renderLogin(["/auth/login"]);

    await fillAndSubmit(user);

    const button = (await screen.findByRole("button", {
      name: /Try again in/,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText("home content")).toBeNull();
  });

  it("sets autocomplete on the login fields", () => {
    renderLogin(["/auth/login"]);

    expect(
      screen
        .getByPlaceholderText("Enter your username")
        .getAttribute("autoComplete"),
    ).toBe("username");
    expect(
      screen
        .getByPlaceholderText("Enter your password")
        .getAttribute("autoComplete"),
    ).toBe("current-password");
  });
});
