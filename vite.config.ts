import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/hot-proxy/rebang": {
        target: "https://rebang.open2hub.com",
        changeOrigin: true,
        rewrite: () => "/"
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        newtab: "index.html",
        sidepanel: "sidepanel.html",
        background: "src/background/serviceWorker.ts",
        translateFloatingButton: "src/content/translateFloatingButton.ts"
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background"
            ? "background.js"
            : chunk.name === "translateFloatingButton"
              ? "translateFloatingButton.js"
              : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
