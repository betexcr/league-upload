import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    css: true,
    globals: true
  },
  resolve: {
    alias: {
      "styled-system": path.resolve(__dirname, "../../styled-system"),
      "@league/types": path.resolve(__dirname, "../../packages/types/src"),
      "@league/upload-core": path.resolve(
        __dirname,
        "../../packages/upload-core/src"
      ),
      "@league/upload-ui": path.resolve(
        __dirname,
        "../../packages/upload-ui/src"
      ),
      "@league/doc-viewer": path.resolve(
        __dirname,
        "../../packages/doc-viewer/src"
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@tanstack")) {
            return "query";
          }
          if (
            id.includes("react") ||
            id.includes("scheduler") ||
            id.includes("use-sync-external-store") ||
            id.includes("prop-types")
          ) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
});
