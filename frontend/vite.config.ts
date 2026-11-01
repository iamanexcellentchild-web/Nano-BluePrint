import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The dev server proxies /api to Django so the browser sees one origin (no CORS setup needed).
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
