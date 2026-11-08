import clsx, { type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import dayjsRelativeTime from "dayjs/plugin/relativeTime";
import dayjsUtc from "dayjs/plugin/utc";
import dayjs from "dayjs";
import { BASE_PATH } from "./consts";

dayjs.extend(dayjsRelativeTime);
dayjs.extend(dayjsUtc);
export { dayjs };

export const cn = (...args: ClassValue[]) => {
  return twMerge(clsx(...args));
};

export const ucfirst = (text?: string | null) => {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
};

export const readableBytes = (bytes?: number | null, divider = 1024) => {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0 || !Number.isFinite(bytes)) return "n/a";

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    sizes.length - 1,
    Math.max(0, Math.floor(Math.log(bytes) / Math.log(divider))),
  );

  return `${(bytes / Math.pow(divider, i)).toFixed(1)} ${sizes[i]}`;
};

export const handleError = (err: unknown) => {
  toast.error((err as Error)?.message || "Unknown error");
};

export const copyToClipboard = async (text: string) => {
  let textArea: HTMLTextAreaElement | undefined;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      textArea = document.createElement("textarea");
      textArea.value = text;

      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";

      document.body.prepend(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("Copy failed");
      }
    }

    toast.success("Copied to clipboard");
  } catch (err) {
    handleError(err);
  } finally {
    textArea?.remove();
  }
};

export const url = (...paths: unknown[]) => {
  return BASE_PATH + paths.join("/");
};

// encodePath escapes each segment of a path, so a key with #, ?, or a
// space keeps its separators and reaches the backend intact.
export const encodePath = (path: string) =>
  path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

// Accept only an in-app path for the post-login redirect. Reject absolute
// URLs, protocol-relative URLs, backslashes, and paths back into /auth,
// which would loop the login page. Fall back to the dashboard.
export const parseReturnTo = (value: string | null | undefined): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  // "/\evil.example" resolves to another origin in a browser.
  if (value.includes("\\")) {
    return "/";
  }
  if (value === "/auth" || value.startsWith("/auth/")) {
    return "/";
  }
  return value;
};

// Garage returns expiration as a UTC timestamp. A local-zone format can show
// the previous or next day, so the table shows the UTC date and names it.
export const formatExpiryDate = (iso: string) =>
  dayjs.utc(iso).format("YYYY-MM-DD") + " UTC";
