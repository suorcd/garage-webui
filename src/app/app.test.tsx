import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { APIError } from "@/lib/api";
import { createQueryClient } from "./query-client";

function wrapperFor(client: ReturnType<typeof createQueryClient>) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("createQueryClient defaults", () => {
  it("does not retry a query that fails with 401", async () => {
    vi.useFakeTimers();
    try {
      const queryFn = vi.fn(() =>
        Promise.reject(new APIError("unauthorized", 401)),
      );
      const client = createQueryClient();
      const { result } = renderHook(
        () => useQuery({ queryKey: ["probe"], queryFn }),
        { wrapper: wrapperFor(client) },
      );

      await vi.advanceTimersByTimeAsync(10_000);

      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(result.current.isError).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not refetch on window focus", async () => {
    const queryFn = vi.fn(() => Promise.resolve("ok"));
    const client = createQueryClient();
    const { result } = renderHook(
      () => useQuery({ queryKey: ["probe"], queryFn }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("treats data as fresh for 30 seconds", async () => {
    const queryFn = vi.fn(() => Promise.resolve("ok"));
    const client = createQueryClient();
    const wrapper = wrapperFor(client);

    const first = renderHook(
      () => useQuery({ queryKey: ["probe"], queryFn }),
      { wrapper },
    );
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(
      () => useQuery({ queryKey: ["probe"], queryFn }),
      { wrapper },
    );
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a query that times out", async () => {
    vi.useFakeTimers();
    try {
      const queryFn = vi.fn(() =>
        Promise.reject(new APIError("Request timed out", 408)),
      );
      const client = createQueryClient();
      const { result } = renderHook(
        () => useQuery({ queryKey: ["probe-timeout"], queryFn }),
        { wrapper: wrapperFor(client) },
      );

      await vi.advanceTimersByTimeAsync(120_000);

      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(result.current.isError).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Toaster limits", () => {
  afterEach(() => {
    cleanup();
    toast.dismiss();
    vi.clearAllMocks();
  });

  it("shows at most five toasts, at the top right, each with a close button", async () => {
    const { default: App } = await import("./app");
    render(<App />);

    for (let i = 0; i < 7; i++) {
      toast.error(`boom ${i}`);
    }

    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-sonner-toast]"),
      ).toHaveLength(7),
    );
    const visible = [...document.querySelectorAll("[data-sonner-toast]")].filter(
      (el) => el.getAttribute("data-visible") === "true",
    );
    expect(visible).toHaveLength(5);
    expect(
      screen.getAllByRole("button", { name: "Close toast" }).length,
    ).toBeGreaterThan(0);
    const toaster = document.querySelector("[data-sonner-toaster]");
    expect(toaster?.getAttribute("data-y-position")).toBe("top");
    expect(toaster?.getAttribute("data-x-position")).toBe("right");
  });
});
