import { create } from "zustand";
import { GitClient, type GitBranchInfo, type GitCommitInfo, type GitDiffHunk, type GitFileStatus } from "@knox/git";
import { knoxEvents } from "@knox/shared";

interface GitState {
  client: GitClient | null;
  loading: boolean;
  isRepo: boolean;
  status: GitFileStatus[];
  branches: GitBranchInfo[];
  currentBranch: string | null;
  log: GitCommitInfo[];
  error: string | null;
  viewingDiff: string | null;
  diffHunks: GitDiffHunk[];

  connect(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void>;
  refresh(): Promise<void>;
  initRepo(): Promise<void>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  discard(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  checkout(ref: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  openDiff(path: string): Promise<void>;
  closeDiff(): void;
  reset(): void;
}

export const useGitStore = create<GitState>((set, get) => ({
  client: null,
  loading: false,
  isRepo: false,
  status: [],
  branches: [],
  currentBranch: null,
  log: [],
  error: null,
  viewingDiff: null,
  diffHunks: [],

  async connect(workspaceId, fsBackend, directoryHandle) {
    set({ loading: true, error: null });
    try {
      const client = await GitClient.create(workspaceId, fsBackend, directoryHandle);
      const isRepo = await client.isRepo();
      set({ client, isRepo, loading: false });
      if (isRepo) await get().refresh();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async refresh() {
    const { client } = get();
    if (!client) return;
    try {
      const [status, branches, currentBranch, log] = await Promise.all([
        client.status(),
        client.listBranches(),
        client.currentBranch(),
        client.log(30),
      ]);
      set({ status, branches, currentBranch, log, error: null });
      knoxEvents.emit("GIT_STATUS_CHANGED", { branch: currentBranch, changedFiles: status.length });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async initRepo() {
    const { client } = get();
    if (!client) return;
    await client.init();
    set({ isRepo: true });
    await get().refresh();
  },

  async stage(paths) {
    await get().client?.add(paths.map((p) => p.replace(/^\//, "")));
    await get().refresh();
  },
  async unstage(paths) {
    await get().client?.unstage(paths.map((p) => p.replace(/^\//, "")));
    await get().refresh();
  },
  async discard(paths) {
    await get().client?.discard(paths);
    await get().refresh();
  },
  async commit(message) {
    await get().client?.commit(message);
    await get().refresh();
  },
  async checkout(ref) {
    await get().client?.checkout(ref);
    await get().refresh();
  },
  async createBranch(name) {
    await get().client?.createBranch(name, true);
    await get().refresh();
  },

  async openDiff(path) {
    const hunks = (await get().client?.diffFile(path)) ?? [];
    set({ viewingDiff: path, diffHunks: hunks });
  },
  closeDiff() {
    set({ viewingDiff: null, diffHunks: [] });
  },

  reset() {
    get().client?.dispose();
    set({ client: null, isRepo: false, status: [], branches: [], currentBranch: null, log: [], viewingDiff: null, diffHunks: [], error: null });
  },
}));
