/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

/**
 * Precaches the app shell (JS/CSS/fonts/worker chunks) so a repeat visit is
 * instant and works fully offline (SPEC sections 3, 35, 61). This is a
 * deliberately minimal, auditable service worker - no runtime network
 * caching/proxying beyond serving the precached shell, since Knox's actual
 * data (files, git, settings) lives in OPFS/IndexedDB, not behind fetch.
 */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
