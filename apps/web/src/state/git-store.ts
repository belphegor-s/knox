import { create } from "zustand";
import { GitClient, type GitBranchInfo, type GitCommitInfo, type GitDiffHunk, type GitFileStatus } from "@knox/git";
import { knoxEvents } from "@knox/shared";
import { getRemoteSettings, saveRemoteSettings, deleteRemoteSettings, type GitRemoteSettings } from "../services/git-remote-settings";

/** Which remote operation is currently in flight, if any - drives disabling the
 * fetch/pull/push buttons and showing a status label, since these are real network
 * calls that can take seconds (or hang on a bad URL/auth). */
type RemoteOp = "fetch" | "pull" | "push" | null;

interface GitState {
  client: GitClient | null;
  workspaceId: string | null;
  loading: boolean;
  isRepo: boolean;
  status: GitFileStatus[];
  branches: GitBranchInfo[];
  currentBranch: string | null;
  log: GitCommitInfo[];
  error: string | null;
  viewingDiff: string | null;
  diffHunks: GitDiffHunk[];
  remote: GitRemoteSettings | null;
  remoteOp: RemoteOp;

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
  setRemote(url: string, username: string, token: string): Promise<void>;
  clearRemote(): Promise<void>;
  fetchRemote(): Promise<void>;
  pull(): Promise<void>;
  push(): Promise<void>;
  reset(): void;
}

export const useGitStore = create<GitState>((set, get) => ({
  client: null,
  workspaceId: null,
  loading: false,
  isRepo: false,
  status: [],
  branches: [],
  currentBranch: null,
  log: [],
  error: null,
  viewingDiff: null,
  diffHunks: [],
  remote: null,
  remoteOp: null,

  async connect(workspaceId, fsBackend, directoryHandle) {
    set({ loading: true, error: null, workspaceId });
    try {
      const [client, remote] = await Promise.all([GitClient.create(workspaceId, fsBackend, directoryHandle), getRemoteSettings(workspaceId)]);
      const isRepo = await client.isRepo();
      set({ client, isRepo, loading: false, remote });
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
      // A freshly-initialized repo has a symbolic HEAD (so currentBranch resolves to
      // e.g. "main") but no ref object yet, so listBranches() returns nothing until the
      // first commit exists - without this, the branch selector renders empty even
      // though the branch name is already known.
      const withCurrent =
        currentBranch && !branches.some((b) => b.name === currentBranch)
          ? [...branches, { name: currentBranch, current: true }]
          : branches;
      set({ status, branches: withCurrent, currentBranch, log, error: null });
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

  async setRemote(url, username, token) {
    const { client, workspaceId } = get();
    if (!client || !workspaceId) return;
    const settings: GitRemoteSettings = { workspaceId, url, username, token };
    await client.addRemote("origin", url);
    await saveRemoteSettings(settings);
    set({ remote: settings, error: null });
  },
  async clearRemote() {
    const { client, workspaceId } = get();
    if (!workspaceId) return;
    await client?.deleteRemote("origin").catch(() => {});
    await deleteRemoteSettings(workspaceId);
    set({ remote: null });
  },
  async fetchRemote() {
    const { client, remote } = get();
    if (!client) return;
    set({ remoteOp: "fetch", error: null });
    try {
      await client.fetch({ auth: remote?.token ? { username: remote.username || "token", password: remote.token } : undefined });
      await get().refresh();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ remoteOp: null });
    }
  },
  async pull() {
    const { client, remote } = get();
    if (!client) return;
    set({ remoteOp: "pull", error: null });
    try {
      await client.pull(undefined, { auth: remote?.token ? { username: remote.username || "token", password: remote.token } : undefined });
      await get().refresh();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ remoteOp: null });
    }
  },
  async push() {
    const { client, remote } = get();
    if (!client) return;
    set({ remoteOp: "push", error: null });
    try {
      await client.push({ auth: remote?.token ? { username: remote.username || "token", password: remote.token } : undefined });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ remoteOp: null });
    }
  },

  reset() {
    get().client?.dispose();
    set({
      client: null,
      workspaceId: null,
      isRepo: false,
      status: [],
      branches: [],
      currentBranch: null,
      log: [],
      viewingDiff: null,
      diffHunks: [],
      error: null,
      remote: null,
      remoteOp: null,
    });
  },
}));
