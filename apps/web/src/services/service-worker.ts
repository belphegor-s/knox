/**
 * Registers the precaching service worker in production builds only
 * (SPEC sections 3/35: fast repeat startup, offline-first). Never forces a
 * reload on update - an in-progress edit only lives in the Monaco buffer
 * until saved, and a surprise reload would lose it silently, which is
 * exactly the kind of "fake reliability" the spec warns against.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { type: "module" }).catch(() => {
      // Offline-first doesn't mean SW-or-bust: the app works fully without
      // it, just without instant repeat loads.
    });
  });
}
