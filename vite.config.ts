import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { handleApi } from "./server/api.ts";

/** The same API the production server serves, mounted in the dev server. */
const api: Plugin = {
  name: "demo-gallery-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => { if (!(await handleApi(req, res))) next(); });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), api],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { port: 8790, host: "127.0.0.1" },
});
