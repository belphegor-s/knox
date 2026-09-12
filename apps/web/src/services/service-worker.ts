// Production only; never force-reloads on update since that could drop unsaved edits.
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    // Scoped to /app/, not /sw.js's own directory (/) - the root is the marketing landing
    // page and must never be under this service worker's control.
    void navigator.serviceWorker.register("/sw.js", { type: "module", scope: "/app/" }).catch(() => {});
  });
}
