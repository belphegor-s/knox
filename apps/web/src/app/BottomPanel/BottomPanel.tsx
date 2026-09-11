import { useState } from "react";
import { useLayoutStore } from "../../state/layout-store";
import { useDragResize } from "../../hooks/useDragResize";
import "./BottomPanel.css";

type Tab = "terminal" | "problems";

export function BottomPanel(): React.ReactElement | null {
  const visible = useLayoutStore((s) => s.panelVisible);
  const height = useLayoutStore((s) => s.panelHeight);
  const setHeight = useLayoutStore((s) => s.setPanelHeight);
  const setVisible = useLayoutStore((s) => s.setPanelVisible);
  const [tab, setTab] = useState<Tab>("terminal");
  const resize = useDragResize({ axis: "y", grows: "start", value: height, min: 120, max: 640, onChange: setHeight });

  if (!visible) return null;

  return (
    <div className="knox-bottompanel" style={{ height }}>
      <div className="knox-bottompanel__resize-handle" onPointerDown={resize.onPointerDown} />
      <div className="knox-bottompanel__tabs">
        <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          Terminal
        </button>
        <button className={tab === "problems" ? "active" : ""} onClick={() => setTab("problems")}>
          Problems
        </button>
        <div className="knox-bottompanel__spacer" />
        <button aria-label="Close panel" onClick={() => setVisible(false)}>
          ✕
        </button>
      </div>
      <div className="knox-bottompanel__content">
        {tab === "terminal" && (
          <div className="knox-bottompanel__empty">
            <p>The terminal isn't wired up yet in this build.</p>
            <p className="knox-bottompanel__empty-detail">
              It runs a local shell over WASM in a worker (SPEC section 13) - arriving in the next implementation pass.
            </p>
          </div>
        )}
        {tab === "problems" && (
          <div className="knox-bottompanel__empty">
            <p>No problems detected.</p>
            <p className="knox-bottompanel__empty-detail">Diagnostics appear here once the language service and linters are wired up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
