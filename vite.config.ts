import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  // Normalise the base path. Strip trailing slashes, map "/" to "".
  // Drop a value that does not start with "/". The dev server and
  // the production build share this value.
  const rawBase = process.env.VITE_BASE_PATH || "";
  const trimmedBase = rawBase.replace(/\/+$/, "");
  const basePath = trimmedBase.startsWith("/") ? trimmedBase : "";
  const base = basePath === "" ? "/" : `${basePath}/`;

  // The dev proxy answers on /api and on <base>/api. The app calls
  // <base>/api when a base path is set. Default the target to the
  // local API port, so the proxy works without a .env file.
  const proxyTarget = process.env.VITE_API_URL || "http://127.0.0.1:3909";
  const proxy: Record<string, { target: string; changeOrigin: boolean }> = {
    "/api": { target: proxyTarget, changeOrigin: true },
  };
  if (basePath !== "") {
    proxy[`${basePath}/api`] = { target: proxyTarget, changeOrigin: true };
  }

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      proxy,
    },
  };
});
