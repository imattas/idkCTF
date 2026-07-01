import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: { env: { API_PROXY_TARGET?: string } };

const apiProxyTarget = process.env.API_PROXY_TARGET || "http://localhost:8787";

// The React app lives in ./web and builds into ./dist, which the Worker serves
// via its ASSETS binding (SPA fallback configured in wrangler.jsonc).
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev:web` runs Vite with HMR and proxies API calls to `wrangler dev`.
    proxy: {
      "/api": apiProxyTarget,
    },
  },
});
