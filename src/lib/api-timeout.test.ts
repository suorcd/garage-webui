import { afterEach, describe, expect, it, vi } from "vitest";
import api, { APIError } from "./api";

type CapturedCall = {
  url: URL;
  init: RequestInit;
};

function stubFetch(response: Response | Error) {
  const calls: CapturedCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    if (response instanceof Error || response instanceof DOMException) {
      throw response;
    }
    return response.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function jsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("api request timeout", () => {
  it("passes a timeout signal to fetch by default", async () => {
    const { calls } = stubFetch(jsonResponse("[]", 200));

    await api.get("/buckets");

    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the default signal after 30 seconds", async () => {
    vi.useFakeTimers();
    const { calls } = stubFetch(jsonResponse("[]", 200));

    await api.get("/buckets");

    const signal = calls[0].init.signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
  });

  it("gives uploads a longer timeout than other requests", async () => {
    vi.useFakeTimers();
    const { calls } = stubFetch(jsonResponse("{}", 200));
    const formData = new FormData();
    formData.append("file", new Blob(["x"]));

    await api.put("/browse/photos/key", { body: formData });

    const signal = calls[0].init.signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(570_000);
    expect(signal.aborted).toBe(true);
  });

  it("surfaces a timeout as a readable error", async () => {
    stubFetch(new DOMException("The operation timed out.", "TimeoutError"));

    let error: unknown;
    try {
      await api.get("/buckets");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).message).toBe("Request timed out");
    expect((error as APIError).status).toBe(408);
  });

  it("respects a caller-provided signal", async () => {
    const { calls } = stubFetch(jsonResponse("[]", 200));
    const signal = AbortSignal.timeout(5_000);

    await api.get("/buckets", { signal });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal).toBe(signal);
  });
});
