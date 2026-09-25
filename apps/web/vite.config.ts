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
        // The root is the marketing landing page, not the app - installing "Knox" as a PWA
        // must launch straight into the actual IDE at /app/, and the service worker should
        // only take control of that scope, not the landing page.
        start_url: "/app/",
        scope: "/app/",
        icons: [
          { src: "/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
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
      // Most specific first. /api/sessions mirrors nginx's own route to a locally-running
      // apps/session-broker (`pnpm dev:broker`); /__account stands in for knox-api.procd.cc,
      // so the admin overview and account calls are same-origin in dev.
      "/api/sessions": "http://localhost:8083",
      "/api": "http://localhost:8081",
      "/__account": { target: "http://localhost:8081", rewrite: (path) => path.replace(/^\/__account/, "") },
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // Root (index.html) is the marketing landing page - no React, no app shell JS - and
      // the actual IDE lives at /app/. Built as one multi-page Vite project so one
      // `pnpm build` / one Docker image produces both; infra/nginx.conf routes each path
      // to its own index.html.
      input: {
        landing: fileURLToPath(new URL("index.html", import.meta.url)),
        app: fileURLToPath(new URL("app/index.html", import.meta.url)),
        admin: fileURLToPath(new URL("admin/index.html", import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@knox/filesystem"],
  },
});
