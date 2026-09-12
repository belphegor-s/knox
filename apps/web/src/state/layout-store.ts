import { create } from "zustand";
import type { PanelLayout } from "@knox/shared";

interface LayoutState extends PanelLayout {
  distractionFree: boolean;
  setSidebarVisible(visible: boolean): void;
  setSidebarWidth(width: number): void;
  setPanelVisible(visible: boolean): void;
  setPanelHeight(height: number): void;
  setAiPanelVisible(visible: boolean): void;
  setAiPanelWidth(width: number): void;
  setActiveActivityView(view: PanelLayout["activeActivityView"]): void;
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
};

export const useLayoutStore = create<LayoutState>((set) => ({
  ...DEFAULT_LAYOUT,
  distractionFree: false,
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.round(width) }),
  setPanelVisible: (visible) => set({ panelVisible: visible }),
  setPanelHeight: (height) => set({ panelHeight: Math.round(height) }),
  setAiPanelVisible: (visible) => set({ aiPanelVisible: visible }),
  setAiPanelWidth: (width) => set({ aiPanelWidth: Math.round(width) }),
  setActiveActivityView: (view) => set({ activeActivityView: view, sidebarVisible: true }),
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
  };
}
