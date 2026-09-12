import { useRef } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useLayoutStore } from "../../state/layout-store";
import { useDragResize } from "../../hooks/useDragResize";
import { TerminalPanel } from "./TerminalPanel";
import "./BottomPanel.css";

// Below this, the panel visually reads as "just a strip of tabs" rather than a shrunken
// terminal - dragging past the midpoint between this and EXPANDED_MIN_HEIGHT snaps straight
// to it, matching VS Code's panel-collapse feel instead of stopping at an awkward in-between
// height.
const COLLAPSED_HEIGHT = 32;
const EXPANDED_MIN_HEIGHT = 120;
const SNAP_THRESHOLD = (COLLAPSED_HEIGHT + EXPANDED_MIN_HEIGHT) / 2;

export function BottomPanel(): React.ReactElement | null {
  const visible = useLayoutStore((s) => s.panelVisible);
  const maximized = useLayoutStore((s) => s.panelMaximized);
  const height = useLayoutStore((s) => s.panelHeight);
  const setHeight = useLayoutStore((s) => s.setPanelHeight);
  const setVisible = useLayoutStore((s) => s.setPanelVisible);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximizePanel);
  const tab = useLayoutStore((s) => s.bottomPanelTab);
  const setTab = useLayoutStore((s) => s.setBottomPanelTab);

  const lastExpandedHeight = useRef(Math.max(height, EXPANDED_MIN_HEIGHT));
  if (height > COLLAPSED_HEIGHT) lastExpandedHeight.current = height;
  const collapsed = height <= COLLAPSED_HEIGHT;

  function handleDrag(next: number): void {
    setHeight(next < SNAP_THRESHOLD ? COLLAPSED_HEIGHT : next);
  }

  // The handle still needs to be draggable FROM fully collapsed, so its own range floor is
  // the collapsed height, not the expanded one - only the snap in handleDrag distinguishes them.
  const resize = useDragResize({ axis: "y", grows: "start", value: height, min: COLLAPSED_HEIGHT, max: 640, onChange: handleDrag });

  function toggleCollapsed(): void {
    setHeight(collapsed ? lastExpandedHeight.current : COLLAPSED_HEIGHT);
  }

  // Once the panel has been opened at least once, keep it mounted (hidden via CSS, not
  // unmounted) so the terminal's xterm instance, worker, and shell session (cwd, history)
  // survive being toggled closed - tearing it down and rebuilding it every time both loses
  // that state and crashes xterm's own ResizeObserver mid-teardown.
  const everVisible = useRef(false);
  if (visible) everVisible.current = true;
  if (!everVisible.current) return null;

  return (
    <div
      className={`knox-bottompanel${maximized ? " knox-bottompanel--maximized" : ""}${collapsed ? " knox-bottompanel--collapsed" : ""}`}
      style={maximized ? undefined : { height }}
      hidden={!visible}
    >
      <div
        className="knox-bottompanel__resize-handle"
        title="Drag to resize - double-click to collapse"
        onPointerDown={resize.onPointerDown}
        onDoubleClick={toggleCollapsed}
      />
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
      <div className="knox-bottompanel__content" hidden={collapsed}>
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
