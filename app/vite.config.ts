import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The shared node-free fold lives in the CLI engine's src/core; the app
      // pulls it into the browser bundle through this alias. Safe ONLY because
      // src/core/agent-matrix.ts imports no node builtins.
      "@core": fileURLToPath(new URL("../src/core", import.meta.url)),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
});
