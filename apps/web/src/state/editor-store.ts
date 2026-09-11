import { create } from "zustand";
import type { EditorSelection, OpenTab } from "@knox/shared";

export interface EditorTab extends OpenTab {
  dirty: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activePath: string | null;

  /** Opens a file. Non-preview opens (double-click, edit) pin the tab and replace any preview tab. */
  openFile(path: string, opts?: { preview?: boolean }): void;
  closeTab(path: string): void;
  closeOthers(path: string): void;
  closeAll(): void;
  setActive(path: string): void;
  pinTab(path: string): void;
  setDirty(path: string, dirty: boolean): void;
  updateCursor(path: string, line: number, column: number, selections: EditorSelection[], scrollTop: number): void;
  hydrate(tabs: EditorTab[], activePath: string | null): void;
}

function emptyTab(path: string, preview: boolean): EditorTab {
  return {
    path,
    pinned: false,
    preview,
    cursorLine: 1,
    cursorColumn: 1,
    selections: [],
    scrollTop: 0,
    dirty: false,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activePath: null,

  openFile: (path, opts) => {
    const preview = opts?.preview ?? false;
    const { tabs } = get();
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      set({ activePath: path });
      return;
    }
    if (preview) {
      // Replace any existing (unpinned) preview tab rather than accumulating tabs.
      const withoutPreview = tabs.filter((t) => !(t.preview && !t.pinned));
      set({ tabs: [...withoutPreview, emptyTab(path, true)], activePath: path });
    } else {
      set({ tabs: [...tabs, emptyTab(path, false)], activePath: path });
    }
  },

  closeTab: (path) => {
    const { tabs, activePath } = get();
    const idx = tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.path !== path);
    let nextActive = activePath;
    if (activePath === path) {
      nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null;
    }
    set({ tabs: next, activePath: nextActive });
  },

  closeOthers: (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    set({ tabs: [tab], activePath: path });
  },

  closeAll: () => set({ tabs: [], activePath: null }),

  setActive: (path) => set({ activePath: path }),

  pinTab: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, pinned: true, preview: false } : t)),
    })),

  setDirty: (path, dirty) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty } : t)),
    })),

  updateCursor: (path, cursorLine, cursorColumn, selections, scrollTop) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, cursorLine, cursorColumn, selections, scrollTop } : t)),
    })),

  hydrate: (tabs, activePath) => set({ tabs, activePath }),
}));
