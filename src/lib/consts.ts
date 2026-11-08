// consts.ts

// Strip trailing slashes from a base path. Map "/" to "".
// Drop a value that does not start with "/". The backend replaces
// %BASE_PATH% in index.html. When it serves the file without that
// step, the literal placeholder stays. Treat it as no base path.
export function normalizeBasePath(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const trimmed = value.replace(/\/+$/, "");
  if (trimmed === "" || !trimmed.startsWith("/")) {
    return "";
  }

  return trimmed;
}

export const BASE_PATH = normalizeBasePath(
  (import.meta.env.PROD ? window.__BASE_PATH : null) ||
    import.meta.env.VITE_BASE_PATH ||
    "",
);
