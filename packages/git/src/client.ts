import { createRpcClient } from "@knox/shared";
import GitWorker from "./worker.ts?worker";
import type { GitAuth, GitAuthor, GitBranchInfo, GitCommitInfo, GitDiffHunk, GitFileStatus, GitRemoteInfo } from "./types.js";

interface GitRpcApi {
  [method: string]: (...args: any[]) => Promise<any>;
  init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void>;
  isRepo(): Promise<boolean>;
  gitInit(): Promise<void>;
  clone(url: string, opts?: { corsProxy?: string; ref?: string; depth?: number }): Promise<void>;
  status(): Promise<GitFileStatus[]>;
  add(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  discard(paths: string[]): Promise<void>;
  commit(message: string, author?: GitAuthor): Promise<string>;
  currentBranch(): Promise<string | null>;
  listBranches(): Promise<GitBranchInfo[]>;
  createBranch(name: string, checkout?: boolean): Promise<void>;
  checkout(ref: string): Promise<void>;
  log(depth?: number): Promise<GitCommitInfo[]>;
  diffFile(path: string): Promise<GitDiffHunk[]>;
  fetch(opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void>;
  pull(author?: GitAuthor, opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void>;
  push(opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void>;
  merge(theirs: string, author?: GitAuthor): Promise<{ conflicted: boolean }>;
  listRemotes(): Promise<GitRemoteInfo[]>;
  addRemote(remote: string, url: string): Promise<void>;
  deleteRemote(remote: string): Promise<void>;
}

/** Main-thread handle to the Git worker; every call round-trips off the UI thread. */
export class GitClient {
  private constructor(
    private readonly worker: Worker,
    private readonly api: GitRpcApi,
  ) {}

  static async create(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<GitClient> {
    const worker = new GitWorker();
    const api = createRpcClient<GitRpcApi>(worker);
    await api.init(workspaceId, fsBackend, directoryHandle);
    return new GitClient(worker, api);
  }

  isRepo = (): Promise<boolean> => this.api.isRepo();
  init = (): Promise<void> => this.api.gitInit();
  clone = (url: string, opts?: { corsProxy?: string; ref?: string; depth?: number }): Promise<void> => this.api.clone(url, opts);
  status = (): Promise<GitFileStatus[]> => this.api.status();
  add = (paths: string[]): Promise<void> => this.api.add(paths);
  unstage = (paths: string[]): Promise<void> => this.api.unstage(paths);
  discard = (paths: string[]): Promise<void> => this.api.discard(paths);
  commit = (message: string, author?: GitAuthor): Promise<string> => this.api.commit(message, author);
  currentBranch = (): Promise<string | null> => this.api.currentBranch();
  listBranches = (): Promise<GitBranchInfo[]> => this.api.listBranches();
  createBranch = (name: string, checkout?: boolean): Promise<void> => this.api.createBranch(name, checkout);
  checkout = (ref: string): Promise<void> => this.api.checkout(ref);
  log = (depth?: number): Promise<GitCommitInfo[]> => this.api.log(depth);
  diffFile = (path: string): Promise<GitDiffHunk[]> => this.api.diffFile(path);
  fetch = (opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void> => this.api.fetch(opts);
  pull = (author?: GitAuthor, opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void> => this.api.pull(author, opts);
  push = (opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void> => this.api.push(opts);
  merge = (theirs: string, author?: GitAuthor): Promise<{ conflicted: boolean }> => this.api.merge(theirs, author);
  listRemotes = (): Promise<GitRemoteInfo[]> => this.api.listRemotes();
  addRemote = (remote: string, url: string): Promise<void> => this.api.addRemote(remote, url);
  deleteRemote = (remote: string): Promise<void> => this.api.deleteRemote(remote);

  dispose(): void {
    this.worker.terminate();
  }
}
