import type { Disposable } from "./disposable.js";

/**
 * Filesystem contract implemented by every backend (OPFS, IndexedDB fallback,
 * File System Access API, and - later - a remote/cloud-synced backend).
 * Nothing above this layer (editor, search, git, terminal) is allowed to
 * know which backend is active; see packages/filesystem for implementations
 * and docs/architecture.md for why this boundary exists.
 *
 * All paths are POSIX-style, absolute from the workspace root ("/"), using
 * "/" separators regardless of host OS.
 */

export type FileType = "file" | "directory" | "symlink" | "unknown";

export interface FileStat {
  type: FileType;
  size: number;
  /** Unix epoch milliseconds. */
  mtime: number;
  ctime: number;
  /** Backend-specific opaque version marker; used for optimistic concurrency. */
  version: string;
  readonly: boolean;
}

export interface FileEntry {
  name: string;
  type: FileType;
}

export type FileChangeType = "created" | "modified" | "deleted" | "renamed";

export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
  /** Populated when type === "renamed". */
  oldPath?: string;
}

export type WatchCallback = (event: FileChangeEvent) => void;

export interface WriteOptions {
  /** When set, the write fails unless the file's current version matches (optimistic concurrency). */
  ifMatch?: string;
  /** Create parent directories as needed. Default true. */
  recursive?: boolean;
}

export interface ReaddirOptions {
  /** Recurse into subdirectories, yielding paths relative to the queried dir. */
  recursive?: boolean;
}

export interface SearchOptions {
  /** Glob-style include patterns, e.g. ["**\/*.ts"]. */
  include?: string[];
  exclude?: string[];
  maxResults?: number;
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  signal?: AbortSignal;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  lineText: string;
  matchLength: number;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "NOT_A_DIRECTORY"
      | "IS_A_DIRECTORY"
      | "PERMISSION_DENIED"
      | "QUOTA_EXCEEDED"
      | "INVALID_PATH"
      | "CONFLICT"
      | "UNKNOWN",
    public readonly path?: string,
  ) {
    super(message);
    this.name = "FileSystemError";
  }
}

/**
 * The abstraction every subsystem programs against. Implementations must
 * never load an entire project into memory and must support workspaces with
 * 100k+ files - see docs/performance.md.
 */
export interface VirtualFileSystem {
  readonly id: string;

  readFile(path: string): Promise<Uint8Array>;
  /** Convenience for text files; decodes as UTF-8. */
  readTextFile(path: string): Promise<string>;

  writeFile(path: string, data: Uint8Array | string, options?: WriteOptions): Promise<FileStat>;

  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  delete(path: string, options?: { recursive?: boolean }): Promise<void>;

  rename(from: string, to: string): Promise<void>;

  copy(from: string, to: string): Promise<void>;

  move(from: string, to: string): Promise<void>;

  exists(path: string): Promise<boolean>;

  stat(path: string): Promise<FileStat>;

  readdir(path: string, options?: ReaddirOptions): Promise<FileEntry[]>;

  /** Invokes callback on changes under path (recursive). Dispose to stop watching. */
  watch(path: string, callback: WatchCallback): Disposable;

  search(query: string, options?: SearchOptions): AsyncIterable<SearchMatch>;

  /** Best-effort usage/quota introspection; not all backends can report this precisely. */
  usage(): Promise<{ bytesUsed: number; bytesAvailable: number | null }>;
}
