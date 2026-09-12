import { create } from "zustand";
import type { PanelLayout } from "@knox/shared";

// Below this, the panel visually reads as "just a strip of tabs" rather than a shrunken
// terminal. Shared with BottomPanel.tsx so the drag-snap threshold and the toggle action
// below agree on exactly what "collapsed" means.
export const PANEL_COLLAPSED_HEIGHT = 32;
export const PANEL_EXPANDED_MIN_HEIGHT = 120;

interface LayoutState extends PanelLayout {
  distractionFree: boolean;
  /** Height to restore to when expanding from collapsed - tracked separately from
   * panelHeight itself so collapsing doesn't lose it. */
  lastExpandedPanelHeight: number;
  setSidebarVisible(visible: boolean): void;
  setSidebarWidth(width: number): void;
  setPanelVisible(visible: boolean): void;
  setPanelHeight(height: number): void;
  setAiPanelVisible(visible: boolean): void;
  setAiPanelWidth(width: number): void;
  setActiveActivityView(view: PanelLayout["activeActivityView"]): void;
  setBottomPanelTab(tab: PanelLayout["bottomPanelTab"]): void;
  /** Opens the panel on the Terminal tab if it isn't already the visible focus; otherwise closes the panel. Matches VS Code's Ctrl+`. */
  toggleTerminalFocus(): void;
  /** Cmd+J and the resize handle's double-click both call this - opens the panel if it's
   * fully closed, otherwise collapses/expands it. Deliberately never fully hides an
   * already-open panel: that's what the panel's own close button is for, and collapsing
   * always leaves a draggable sliver behind, unlike setPanelVisible(false). */
  togglePanelCollapsed(): void;
  toggleMaximizePanel(): void;
  toggleDistractionFree(): void;
  hydrate(layout: PanelLayout): void;
}

export const DEFAULT_LAYOUT: PanelLayout = {
  sidebarVisible: true,
  sidebarWidth: 260,
  panelVisible: false,
  panelHeight: 260,
  aiPanelVisible: false,
  aiPanelWidth: 340,
  activeActivityView: "explorer",
  bottomPanelTab: "terminal",
  panelMaximized: false,
};

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...DEFAULT_LAYOUT,
  distractionFree: false,
  lastExpandedPanelHeight: Math.max(DEFAULT_LAYOUT.panelHeight, PANEL_EXPANDED_MIN_HEIGHT),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.round(width) }),
  setPanelVisible: (visible) => set({ panelVisible: visible }),
  setPanelHeight: (height) => {
    const rounded = Math.round(height);
    set((s) => ({
      panelHeight: rounded,
      lastExpandedPanelHeight: rounded > PANEL_COLLAPSED_HEIGHT ? rounded : s.lastExpandedPanelHeight,
    }));
  },
  setAiPanelVisible: (visible) => set({ aiPanelVisible: visible }),
  setAiPanelWidth: (width) => set({ aiPanelWidth: Math.round(width) }),
  setActiveActivityView: (view) => set({ activeActivityView: view, sidebarVisible: true }),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  toggleTerminalFocus: () => {
    const s = get();
    if (s.panelVisible && s.bottomPanelTab === "terminal") {
      set({ panelVisible: false, panelMaximized: false });
      return;
    }
    // setPanelVisible(false) (the panel's own close button) never touches panelHeight, so a
    // panel that was collapsed before being closed stays at PANEL_COLLAPSED_HEIGHT in the
    // store - reopening it here without restoring left it looking stuck at "only the tabs
    // bar visible" with no indication why, unlike togglePanelCollapsed (Cmd+J) which already
    // handles this same restoration.
    const restoredHeight = s.panelHeight <= PANEL_COLLAPSED_HEIGHT ? Math.max(s.lastExpandedPanelHeight, PANEL_EXPANDED_MIN_HEIGHT) : s.panelHeight;
    set({ panelVisible: true, bottomPanelTab: "terminal", panelHeight: restoredHeight });
  },
  // Reads fresh state via get() rather than closing over a render-time value - a command bound
  // to a keyboard shortcut can fire before React has re-rendered with the latest store value.
  togglePanelCollapsed: () => {
    const s = get();
    if (!s.panelVisible) {
      set({ panelVisible: true, panelHeight: Math.max(s.lastExpandedPanelHeight, PANEL_EXPANDED_MIN_HEIGHT) });
      return;
    }
    if (s.panelHeight <= PANEL_COLLAPSED_HEIGHT) {
      set({ panelHeight: Math.max(s.lastExpandedPanelHeight, PANEL_EXPANDED_MIN_HEIGHT) });
    } else {
      set({ lastExpandedPanelHeight: s.panelHeight, panelHeight: PANEL_COLLAPSED_HEIGHT });
    }
  },
  toggleMaximizePanel: () => {
    const s = get();
    set({ panelMaximized: !s.panelMaximized, panelVisible: true });
  },
  toggleDistractionFree: () =>
    set((s) => ({
      distractionFree: !s.distractionFree,
    })),
  hydrate: (layout) => set(layout),
}));

export function getLayoutSnapshot(): PanelLayout {
  const s = useLayoutStore.getState();
  return {
    sidebarVisible: s.sidebarVisible,
    sidebarWidth: s.sidebarWidth,
    panelVisible: s.panelVisible,
    panelHeight: s.panelHeight,
    aiPanelVisible: s.aiPanelVisible,
    aiPanelWidth: s.aiPanelWidth,
    activeActivityView: s.activeActivityView,
    bottomPanelTab: s.bottomPanelTab,
    panelMaximized: s.panelMaximized,
  };
}
