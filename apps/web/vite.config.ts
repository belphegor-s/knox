import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Cross-origin isolation (COOP/COEP) is required for SharedArrayBuffer and
 * WASM threading (SPEC section 41). We set it in dev here; production
 * deployments must set the same headers at the reverse proxy - see
 * infra/nginx.conf and docs/architecture.md.
 */
const crossOriginIsolationHeaders = {
  name: "cross-origin-isolation",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
  configurePreviewServer(server: import("vite").PreviewServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

export default defineConfig({
  plugins: [
    react(),
    crossOriginIsolationHeaders,
    // Precaches the app shell + Monaco chunks so a second visit is instant
    // and offline (SPEC sections 3, 35: extremely fast startup, offline-first).
    // `injectManifest` (not `generateSW`) because we want an explicit,
    // auditable service worker rather than a black-box generated one.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: {
        name: "Knox",
        short_name: "Knox",
        description: "A local-first, browser-native development environment.",
        theme_color: "#0e0f11",
        background_color: "#0b0c0e",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // Mirrors infra/nginx.conf's /api/ route in production: proxies to a locally-running
    // apps/api (`pnpm dev:api`) if one happens to be up. Harmless when it isn't - requests
    // just fail to connect the same way they'd 502 in production with nothing deployed.
    proxy: {
      "/api": "http://localhost:8081",
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // The marketing landing page is a fully separate static entry - no React, no app
      // shell JS - built alongside the app itself so one `pnpm build` / one Docker image
      // produces both. Served at /landing/ by nginx's default `try_files $uri $uri/
      // /index.html` (the directory's own index.html resolves before the SPA fallback).
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        landing: fileURLToPath(new URL("landing/index.html", import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@knox/filesystem"],
  },
});
