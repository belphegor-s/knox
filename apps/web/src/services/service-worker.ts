// Production only; never force-reloads on update since that could drop unsaved edits.
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { type: "module" }).catch(() => {});
  });
}
