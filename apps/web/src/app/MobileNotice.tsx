import { useState } from "react";
import { useIsNarrowViewport } from "../hooks/useIsNarrowViewport";
import "./MobileNotice.css";

const DISMISSED_KEY = "knox-mobile-notice-dismissed";

/** Knox is a real multi-panel IDE - it genuinely doesn't work on a phone-sized screen
 * (no room for an explorer + editor + terminal, no real keyboard). Rather than silently
 * rendering a broken layout, say so plainly and let the user choose to continue anyway. */
export function MobileNotice(): React.ReactElement | null {
  const isNarrow = useIsNarrowViewport();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");

  if (!isNarrow || dismissed) return null;

  function dismiss(): void {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="knox-mobile-notice" role="dialog" aria-modal="true" aria-label="Switch to desktop">
      <div className="knox-mobile-notice__card">
        <svg className="knox-mobile-notice__mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0e0f11" />
          <text x="16" y="22.5" fontFamily="Helvetica, Arial, sans-serif" fontWeight="700" fontSize="18" fill="#c1602f" textAnchor="middle">
            K
          </text>
        </svg>
        <h1>Knox needs a bigger screen</h1>
        <p>It's a full editor, terminal, and Git client at once - that needs a keyboard and more room than a phone can give it. Open this on a desktop or laptop for the real thing.</p>
        <button type="button" onClick={dismiss}>
          Continue anyway
        </button>
      </div>
    </div>
  );
}
