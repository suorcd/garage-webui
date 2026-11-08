import { afterEach, describe, expect, it, vi } from "vitest";
import api, { APIError } from "./api";

type CapturedCall = {
  url: URL;
  init: RequestInit;
};

function stubFetch(response: Response) {
  const calls: CapturedCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    return response.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function jsonResponse(
  body: string,
  status: number,
  statusText = "",
): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(
  body: string,
  status: number,
  statusText = "",
): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { "Content-Type": "text/plain" },
  });
}

async function apiError(promise: Promise<unknown>): Promise<APIError> {
  try {
    await promise;
  } catch (error) {
    return error as APIError;
  }
  throw new Error("expected the request to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api error parsing", () => {
  it("resolves an empty JSON response instead of throwing", async () => {
    stubFetch(
      new Response(null, {
        status: 204,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(api.get("/buckets")).resolves.toBe("");
  });

  it("reports the status when an error response has an empty JSON body", async () => {
    stubFetch(jsonResponse("", 500));

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("HTTP 500");
  });

  it("uses the status text when a JSON error has no message", async () => {
    stubFetch(
      jsonResponse('{"error":"boom"}', 500, "Internal Server Error"),
    );

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("Internal Server Error");
  });

  it("never throws an APIError with an empty message for a JSON scalar error", async () => {
    stubFetch(jsonResponse("42", 400, "Bad Request"));

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Bad Request");
  });

  it("never throws an APIError with an empty message for a blank message field", async () => {
    stubFetch(jsonResponse('{"message":""}', 400, "Bad Request"));

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.message).toBe("Bad Request");
  });

  it("keeps the plain text message of a text error", async () => {
    stubFetch(textResponse("disk full", 500, "Internal Server Error"));

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("disk full");
  });

  it("keeps the message of a JSON error", async () => {
    stubFetch(jsonResponse('{"message":"bad key"}', 400, "Bad Request"));

    const error = await apiError(api.get("/buckets"));

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("bad key");
  });
});

describe("api param serialisation", () => {
  it("skips undefined and null params", async () => {
    const { calls } = stubFetch(jsonResponse("[]", 200));

    await api.get("/buckets", {
      params: { a: "1", b: undefined, c: null },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get("a")).toBe("1");
    expect(calls[0].url.searchParams.has("b")).toBe(false);
    expect(calls[0].url.searchParams.has("c")).toBe(false);
  });

  it("does not send a literal undefined prefix", async () => {
    const { calls } = stubFetch(jsonResponse("[]", 200));

    await api.get("/browse/bucket", {
      params: { prefix: undefined, next: "abc" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.has("prefix")).toBe(false);
    expect(calls[0].url.searchParams.get("next")).toBe("abc");
  });

  it("sends array params as repeated keys", async () => {
    const { calls } = stubFetch(jsonResponse("[]", 200));

    await api.get("/buckets", { params: { tag: ["a", "b"] } });

    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.getAll("tag")).toEqual(["a", "b"]);
  });

  it("stringifies plain objects and arrays only", async () => {
    const { calls } = stubFetch(jsonResponse("{}", 200));

    await api.post("/buckets", { body: { name: "photos" } });
    await api.post("/buckets", { body: [1, 2] });

    expect(calls).toHaveLength(2);
    expect(calls[0].init.body).toBe('{"name":"photos"}');
    expect(calls[1].init.body).toBe("[1,2]");
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBe("application/json");
  });

  it("passes a Blob body through without stringifying it", async () => {
    const { calls } = stubFetch(jsonResponse("{}", 200));
    const blob = new Blob(["x"], { type: "text/plain" });

    await api.post("/buckets", { body: blob });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.body).toBe(blob);
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("passes a URLSearchParams body through without stringifying it", async () => {
    const { calls } = stubFetch(jsonResponse("{}", 200));
    const params = new URLSearchParams({ a: "1" });

    await api.post("/buckets", { body: params });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.body).toBe(params);
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("passes a null body through without stringifying it", async () => {
    const { calls } = stubFetch(jsonResponse("{}", 200));

    await api.post("/buckets", { body: null });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.body).toBeNull();
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("passes a FormData body through without stringifying it", async () => {
    const { calls } = stubFetch(jsonResponse("{}", 200));
    const formData = new FormData();
    formData.append("file", new Blob(["x"]));

    await api.post("/buckets", { body: formData });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.body).toBe(formData);
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("does not mutate the caller options object", async () => {
    stubFetch(jsonResponse("{}", 200));
    const options = {
      params: { recursive: undefined as boolean | undefined },
      body: { name: "photos" },
    };

    await api.post("/buckets", options);

    expect(options.body).toEqual({ name: "photos" });
    expect(options.params).toEqual({ recursive: undefined });
  });
});
