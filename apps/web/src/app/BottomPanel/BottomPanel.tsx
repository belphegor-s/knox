import { useRef } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { PANEL_COLLAPSED_HEIGHT, PANEL_EXPANDED_MIN_HEIGHT, useLayoutStore } from "../../state/layout-store";
import { useDragResize } from "../../hooks/useDragResize";
import { TerminalPanel } from "./TerminalPanel";
import "./BottomPanel.css";

const SNAP_THRESHOLD = (PANEL_COLLAPSED_HEIGHT + PANEL_EXPANDED_MIN_HEIGHT) / 2;

export function BottomPanel(): React.ReactElement | null {
  const visible = useLayoutStore((s) => s.panelVisible);
  const maximized = useLayoutStore((s) => s.panelMaximized);
  const height = useLayoutStore((s) => s.panelHeight);
  const setHeight = useLayoutStore((s) => s.setPanelHeight);
  const setLastExpandedHeight = useLayoutStore((s) => s.setLastExpandedPanelHeight);
  const setVisible = useLayoutStore((s) => s.setPanelVisible);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximizePanel);
  const toggleCollapsed = useLayoutStore((s) => s.togglePanelCollapsed);
  const tab = useLayoutStore((s) => s.bottomPanelTab);
  const setTab = useLayoutStore((s) => s.setBottomPanelTab);

  // Maximized always shows content regardless of the underlying stored height - without the
  // maximized exclusion, maximizing a panel that had been collapsed produced a huge, completely
  // empty box (the content stayed hidden, since this was computed from the old 32px height, not
  // the panel's actual visible size). Confirmed on the live deployment via Chrome DevTools: a
  // real, clearly visible bug, not a corner case.
  const collapsed = !maximized && height <= PANEL_COLLAPSED_HEIGHT;

  // Captured at the START of a drag (see onHandlePointerDown) so onCommit can tell "what this
  // drag ended AT" (final, near the collapsed floor if the user dragged all the way down) apart
  // from "what it started FROM" - the value actually worth remembering as the height to restore
  // to later. Using `final` for that instead (an earlier version of this fix did) meant a slow
  // drag to fully collapsed recorded something barely above collapsed, not the real expanded
  // height it started from.
  const dragStartHeight = useRef(height);

  // Live drag shows the raw dragged height with no snapping - snapping-while-dragging forced
  // every intermediate frame below SNAP_THRESHOLD back to exactly PANEL_COLLAPSED_HEIGHT, so a
  // short drag gesture showed zero visual movement until it crossed the threshold in one
  // continuous motion, indistinguishable from the handle not responding at all. The snap only
  // applies once, on release (onCommit), to wherever the drag actually ended up.
  //
  // The handle still needs to be draggable FROM fully collapsed, so its own range floor is
  // the collapsed height, not the expanded one - only the release-time snap distinguishes them.
  const resize = useDragResize({
    axis: "y",
    grows: "start",
    value: height,
    min: PANEL_COLLAPSED_HEIGHT,
    max: 640,
    onChange: setHeight,
    onCommit: (final) => {
      if (final < SNAP_THRESHOLD) {
        if (dragStartHeight.current > PANEL_COLLAPSED_HEIGHT) {
          setLastExpandedHeight(Math.max(dragStartHeight.current, PANEL_EXPANDED_MIN_HEIGHT));
        }
        setHeight(PANEL_COLLAPSED_HEIGHT);
      } else {
        setLastExpandedHeight(Math.max(final, PANEL_EXPANDED_MIN_HEIGHT));
      }
    },
  });

  function onHandlePointerDown(e: React.PointerEvent): void {
    dragStartHeight.current = height;
    resize.onPointerDown(e);
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
        onPointerDown={onHandlePointerDown}
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
