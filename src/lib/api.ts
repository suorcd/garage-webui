import * as utils from "@/lib/utils";
import { BASE_PATH } from "./consts";

type RequestBody = BodyInit | Record<string, unknown> | unknown[];

type FetchOptions = Omit<RequestInit, "headers" | "body"> & {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: RequestBody | null;
};

export const API_URL = BASE_PATH + "/api";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function errorMessage(data: unknown, res: Response): string {
  if (
    isPlainObject(data) &&
    typeof data.message === "string" &&
    data.message !== ""
  ) {
    return data.message;
  }
  if (typeof data === "string" && data !== "") {
    return data;
  }
  if (res.statusText !== "") {
    return res.statusText;
  }
  return `HTTP ${res.status}`;
}

// A request without a caller signal gets a deadline. Uploads get more time.
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;

export class APIError extends Error {
  status!: number;
  retryAfter?: number;

  constructor(message: string, status: number = 400, retryAfter?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// Retry-After is either a number of seconds or an HTTP date. Return the
// number of seconds to wait, or undefined when the value is absent or
// invalid.
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

// The 401 redirect is a full page load, so the current path must travel
// in the URL. Strip the base path: the router resolves the stored path
// against the base path again after login.
function loginReturnToQuery(): string {
  const path = window.location.pathname;
  const relative =
    BASE_PATH !== "" &&
    (path === BASE_PATH || path.startsWith(BASE_PATH + "/"))
      ? path.slice(BASE_PATH.length) || "/"
      : path;
  const target = relative + window.location.search;
  const returnTo = target.startsWith("/auth") ? "/" : target;
  return `?returnTo=${encodeURIComponent(returnTo)}`;
}

const api = {
  async fetch<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    const headers: Record<string, string> = {
      "X-Requested-With": "XMLHttpRequest",
    };
    const _url = new URL(API_URL + url, window.location.origin);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== undefined && item !== null) {
              _url.searchParams.append(key, String(item));
            }
          });
          return;
        }
        _url.searchParams.set(key, String(value));
      });
    }

    const {
      params: _params,
      body: rawBody,
      headers: extraHeaders,
      ...init
    } = options ?? {};
    void _params;

    let body: BodyInit | null | undefined;
    if (isPlainObject(rawBody) || Array.isArray(rawBody)) {
      body = JSON.stringify(rawBody);
      headers["Content-Type"] = "application/json";
    } else if (rawBody !== undefined) {
      body = rawBody as BodyInit | null;
    }

    const isUpload = rawBody instanceof FormData;
    const timeoutMs = isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);

    let res: Response;
    let text: string;
    try {
      res = await fetch(_url, {
        ...init,
        signal,
        credentials: "include",
        headers: { ...headers, ...(extraHeaders || {}) },
        body,
      });
      // The deadline also covers the body read. Reading it outside this try
      // let a stalled body escape as a raw DOMException instead of the
      // timeout the caller expects.
      text = await res.text();
    } catch (error) {
      const name = (error as { name?: unknown })?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new APIError("Request timed out", 408);
      }
      throw error;
    }

    const isJson = res.headers
      .get("Content-Type")
      ?.includes("application/json");
    let data: unknown = text;
    if (isJson && text !== "") {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (res.status === 401 && !url.startsWith("/auth")) {
      window.location.href = utils.url("/auth/login") + loginReturnToQuery();
      throw new APIError(
        "unauthorized",
        res.status,
        parseRetryAfter(res.headers.get("Retry-After"))
      );
    }

    if (!res.ok) {
      throw new APIError(
        errorMessage(data, res),
        res.status,
        parseRetryAfter(res.headers.get("Retry-After"))
      );
    }

    return data as unknown as T;
  },

  async get<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    return this.fetch<T>(url, {
      ...options,
      method: "GET",
    });
  },

  async post<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    return this.fetch<T>(url, {
      ...options,
      method: "POST",
    });
  },

  async put<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    return this.fetch<T>(url, {
      ...options,
      method: "PUT",
    });
  },

  async delete<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    return this.fetch<T>(url, {
      ...options,
      method: "DELETE",
    });
  },
};

export default api;
