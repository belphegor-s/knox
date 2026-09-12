import { useRef } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useLayoutStore } from "../../state/layout-store";
import { useDragResize } from "../../hooks/useDragResize";
import { TerminalPanel } from "./TerminalPanel";
import "./BottomPanel.css";

export function BottomPanel(): React.ReactElement | null {
  const visible = useLayoutStore((s) => s.panelVisible);
  const maximized = useLayoutStore((s) => s.panelMaximized);
  const height = useLayoutStore((s) => s.panelHeight);
  const setHeight = useLayoutStore((s) => s.setPanelHeight);
  const setVisible = useLayoutStore((s) => s.setPanelVisible);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximizePanel);
  const tab = useLayoutStore((s) => s.bottomPanelTab);
  const setTab = useLayoutStore((s) => s.setBottomPanelTab);
  const resize = useDragResize({ axis: "y", grows: "start", value: height, min: 120, max: 640, onChange: setHeight });

  // Once the panel has been opened at least once, keep it mounted (hidden via CSS, not
  // unmounted) so the terminal's xterm instance, worker, and shell session (cwd, history)
  // survive being toggled closed - tearing it down and rebuilding it every time both loses
  // that state and crashes xterm's own ResizeObserver mid-teardown.
  const everVisible = useRef(false);
  if (visible) everVisible.current = true;
  if (!everVisible.current) return null;

  return (
    <div
      className={`knox-bottompanel${maximized ? " knox-bottompanel--maximized" : ""}`}
      style={maximized ? undefined : { height }}
      hidden={!visible}
    >
      <div className="knox-bottompanel__resize-handle" onPointerDown={resize.onPointerDown} />
      <div className="knox-bottompanel__tabs">
        <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          Terminal
        </button>
        <button className={tab === "problems" ? "active" : ""} onClick={() => setTab("problems")}>
          Problems
        </button>
        <div className="knox-bottompanel__spacer" />
        <button
          className="knox-bottompanel__close"
          title={maximized ? "Restore Panel Size" : "Maximize Panel Size"}
          aria-label={maximized ? "Restore Panel Size" : "Maximize Panel Size"}
          onClick={toggleMaximize}
        >
          {maximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
        </button>
        <button className="knox-bottompanel__close" aria-label="Close panel" onClick={() => setVisible(false)}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="knox-bottompanel__content">
        <div className="knox-bottompanel__pane" hidden={tab !== "terminal"}>
          <TerminalPanel />
        </div>
        <div className="knox-bottompanel__pane" hidden={tab !== "problems"}>
          <div className="knox-bottompanel__empty">
            <p>No problems detected.</p>
            <p className="knox-bottompanel__empty-detail">Diagnostics appear here once the language service and linters are wired up.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
