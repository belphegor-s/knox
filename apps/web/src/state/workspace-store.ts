import { create } from "zustand";
import type { VirtualFileSystem, WorkspaceMetadata } from "@knox/shared";

export type WorkspaceLoadPhase = "none" | "loading" | "ready" | "error";

interface WorkspaceState {
  phase: WorkspaceLoadPhase;
  metadata: WorkspaceMetadata | null;
  fs: VirtualFileSystem | null;
  error: string | null;
  setLoading(): void;
  setReady(metadata: WorkspaceMetadata, fs: VirtualFileSystem): void;
  setError(message: string): void;
  reset(): void;
}

/**
 * Runtime workspace state - the *active* filesystem instance and metadata.
 * Deliberately holds a live VirtualFileSystem reference (not serializable
 * data) so components call fs.readFile/writeFile directly rather than
 * round-tripping through Redux-style actions for every keystroke.
 */
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  phase: "none",
  metadata: null,
  fs: null,
  error: null,
  setLoading: () => set({ phase: "loading", error: null }),
  setReady: (metadata, fs) => set({ phase: "ready", metadata, fs, error: null }),
  setError: (message) => set({ phase: "error", error: message }),
  reset: () => set({ phase: "none", metadata: null, fs: null, error: null }),
}));
