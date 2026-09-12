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

// Holds the live VirtualFileSystem instance directly, not serialized state.
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
