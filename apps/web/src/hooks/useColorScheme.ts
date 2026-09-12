import { useEffect, useState } from "react";

function computeScheme(): "dark" | "light" {
  const override = document.documentElement.getAttribute("data-theme");
  if (override === "light" || override === "dark") return override;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Tracks the app's effective color scheme (manual data-theme override, else OS preference) -
 * live, not just on mount, so switching OS theme or a future in-app toggle updates immediately. */
export function useColorScheme(): "dark" | "light" {
  const [scheme, setScheme] = useState(computeScheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const update = (): void => setScheme(computeScheme());
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return scheme;
}
