import { Buffer } from "buffer";
// isomorphic-git assumes Node's Buffer global; Vite doesn't polyfill it for workers.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { createFileSystem, FileSystemAccessBackend } from "@knox/filesystem";
import { exposeRpc, type VirtualFileSystem } from "@knox/shared";
import { GitService } from "./git-service.js";
import type { GitAuth, GitAuthor } from "./types.js";

let vfs: VirtualFileSystem;
let service: GitService;

async function init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void> {
  vfs =
    fsBackend === "file-system-access" && directoryHandle
      ? await FileSystemAccessBackend.fromHandle(workspaceId, directoryHandle)
      : await createFileSystem(workspaceId);
  service = new GitService(vfs);
}

exposeRpc({
  init,
  isRepo: () => service.isRepo(),
  gitInit: () => service.init(),
  clone: (url: string, opts?: { corsProxy?: string; ref?: string; depth?: number }) => service.clone(url, opts),
  status: () => service.status(),
  add: (paths: string[]) => service.add(paths),
  unstage: (paths: string[]) => service.unstage(paths),
  discard: (paths: string[]) => service.discard(paths, vfs),
  commit: (message: string, author?: GitAuthor) => service.commit(message, author),
  currentBranch: () => service.currentBranch(),
  listBranches: () => service.listBranches(),
  createBranch: (name: string, checkout?: boolean) => service.createBranch(name, checkout),
  checkout: (ref: string) => service.checkout(ref),
  log: (depth?: number) => service.log(depth),
  diffFile: (path: string) => service.diffFile(path, vfs),
  fetch: (opts?: { corsProxy?: string }) => service.fetch(opts),
  pull: (author?: GitAuthor, opts?: { corsProxy?: string }) => service.pull(author, opts),
  push: (opts?: { corsProxy?: string; auth?: GitAuth }) => service.push(opts),
  merge: (theirs: string, author?: GitAuthor) => service.merge(theirs, author),
});
