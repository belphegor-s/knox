import {
  Emitter,
  FileSystemError,
  normalizePath,
  basename,
  dirname,
  type Disposable,
  type FileEntry,
  type FileStat,
  type ReaddirOptions,
  type SearchMatch,
  type SearchOptions,
  type VirtualFileSystem,
  type WatchCallback,
  type WriteOptions,
  type FileChangeEvent,
} from "@knox/shared";
import { matchesAny } from "./glob.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function mapDomError(err: unknown, path: string): FileSystemError {
  if (err instanceof FileSystemError) return err;
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotFoundError":
      return new FileSystemError(`No such file or directory: ${path}`, "NOT_FOUND", path);
    case "TypeMismatchError":
      return new FileSystemError(`Not a directory: ${path}`, "NOT_A_DIRECTORY", path);
    case "InvalidModificationError":
    case "InvalidStateError":
    case "NotAllowedError":
      return new FileSystemError(`Operation not permitted on: ${path}`, "PERMISSION_DENIED", path);
    case "QuotaExceededError":
      return new FileSystemError(`Storage quota exceeded writing: ${path}`, "QUOTA_EXCEEDED", path);
    default:
      return new FileSystemError(
        `Filesystem error on ${path}: ${err instanceof Error ? err.message : String(err)}`,
        "UNKNOWN",
        path,
      );
  }
}

// Shared tree-walking logic for any backend rooted at a FileSystemDirectoryHandle (OPFS, FSA).
// watch() only sees writes made through this instance - no native cross-tab notification exists.
export abstract class FileSystemHandleBackend implements VirtualFileSystem {
  protected readonly changeEmitter = new Emitter<FileChangeEvent>();

  constructor(
    readonly id: string,
    protected readonly root: FileSystemDirectoryHandle,
  ) {}

  protected async getDirHandle(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const norm = normalizePath(path);
    if (norm === "/") return this.root;
    let handle = this.root;
    for (const seg of norm.split("/").filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(seg, { create });
      } catch (err) {
        throw mapDomError(err, path);
      }
    }
    return handle;
  }

  protected async getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const norm = normalizePath(path);
    const parent = await this.getDirHandle(dirname(norm), create);
    try {
      return await parent.getFileHandle(basename(norm), { create });
    } catch (err) {
      throw mapDomError(err, path);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const handle = await this.getFileHandle(path, false);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async readTextFile(path: string): Promise<string> {
    return textDecoder.decode(await this.readFile(path));
  }

  async writeFile(path: string, data: Uint8Array | string, options?: WriteOptions): Promise<FileStat> {
    const norm = normalizePath(path);
    const existedBefore = await this.exists(norm);
    if (options?.ifMatch) {
      const current = existedBefore ? await this.stat(norm) : null;
      if (current && current.version !== options.ifMatch) {
        throw new FileSystemError(`Concurrent modification: ${norm}`, "CONFLICT", norm);
      }
    }
    if (options?.recursive !== false) {
      await this.getDirHandle(dirname(norm), true);
    }
    const handle = await this.getFileHandle(norm, true);
    const writable = await handle.createWritable();
    try {
      const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
      // cast: lib types are stricter here than what browsers actually accept
      await writable.write(bytes as unknown as BufferSource);
    } finally {
      await writable.close();
    }
    const stat = await this.stat(norm);
    this.changeEmitter.fire({ type: existedBefore ? "modified" : "created", path: norm });
    return stat;
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const norm = normalizePath(path);
    if (options?.recursive === false) {
      const parent = await this.getDirHandle(dirname(norm), false);
      await parent.getDirectoryHandle(basename(norm), { create: true }).catch((e) => {
        throw mapDomError(e, norm);
      });
    } else {
      await this.getDirHandle(norm, true);
    }
    this.changeEmitter.fire({ type: "created", path: norm });
  }

  async delete(path: string, options?: { recursive?: boolean }): Promise<void> {
    const norm = normalizePath(path);
    const parent = await this.getDirHandle(dirname(norm), false);
    try {
      await parent.removeEntry(basename(norm), { recursive: options?.recursive ?? true });
    } catch (err) {
      throw mapDomError(err, norm);
    }
    this.changeEmitter.fire({ type: "deleted", path: norm });
  }

  async copy(from: string, to: string): Promise<void> {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    const stat = await this.stat(src);
    if (stat.type === "directory") {
      await this.mkdir(dst, { recursive: true });
      for (const entry of await this.readdir(src)) {
        await this.copy(`${src}/${entry.name}`, `${dst}/${entry.name}`);
      }
    } else {
      await this.writeFile(dst, await this.readFile(src));
    }
  }

  async move(from: string, to: string): Promise<void> {
    await this.copy(from, to);
    await this.delete(from, { recursive: true });
    this.changeEmitter.fire({ type: "renamed", path: normalizePath(to), oldPath: normalizePath(from) });
  }

  async rename(from: string, to: string): Promise<void> {
    await this.move(from, to);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch (err) {
      if (err instanceof FileSystemError && err.code === "NOT_FOUND") return false;
      throw err;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const norm = normalizePath(path);
    if (norm === "/") {
      return { type: "directory", size: 0, mtime: 0, ctime: 0, version: "root", readonly: false };
    }
    const parent = await this.getDirHandle(dirname(norm), false);
    const name = basename(norm);
    try {
      const fileHandle = await parent.getFileHandle(name);
      const file = await fileHandle.getFile();
      return {
        type: "file",
        size: file.size,
        mtime: file.lastModified,
        ctime: file.lastModified,
        version: `${file.lastModified}-${file.size}`,
        readonly: false,
      };
    } catch {
      try {
        await parent.getDirectoryHandle(name);
        return { type: "directory", size: 0, mtime: 0, ctime: 0, version: "dir", readonly: false };
      } catch (err) {
        throw mapDomError(err, norm);
      }
    }
  }

  async readdir(path: string, options?: ReaddirOptions): Promise<FileEntry[]> {
    const dir = await this.getDirHandle(path, false);
    const entries: FileEntry[] = [];
    // @ts-expect-error -- async iterator on FileSystemDirectoryHandle, present at runtime
    for await (const [name, handle] of dir.entries()) {
      entries.push({ name, type: handle.kind === "directory" ? "directory" : "file" });
      if (options?.recursive && handle.kind === "directory") {
        const norm = normalizePath(path);
        const sub = await this.readdir(`${norm === "/" ? "" : norm}/${name}`, options);
        for (const child of sub) entries.push({ name: `${name}/${child.name}`, type: child.type });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  watch(path: string, callback: WatchCallback): Disposable {
    const norm = normalizePath(path);
    return this.changeEmitter.event((evt) => {
      if (norm === "/" || evt.path === norm || evt.path.startsWith(`${norm}/`)) callback(evt);
    });
  }

  async *search(query: string, options?: SearchOptions): AsyncIterable<SearchMatch> {
    const flags = options?.caseSensitive ? "g" : "gi";
    const pattern = options?.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const finalPattern = options?.wholeWord ? `\\b${pattern}\\b` : pattern;
    const re = new RegExp(finalPattern, flags);
    let count = 0;
    const maxResults = options?.maxResults ?? 1000;

    const self = this;
    async function* walk(dir: string): AsyncIterable<string> {
      const entries = await self.readdir(dir);
      for (const entry of entries) {
        const full = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (options?.exclude && matchesAny(full, options.exclude)) continue;
        if (entry.type === "directory") {
          yield* walk(full);
        } else {
          if (options?.include && !matchesAny(full, options.include)) continue;
          yield full;
        }
      }
    }

    for await (const filePath of walk("/")) {
      if (options?.signal?.aborted) return;
      if (count >= maxResults) return;
      let text: string;
      try {
        text = await this.readTextFile(filePath);
      } catch {
        continue;
      }
      if (text.indexOf(String.fromCharCode(0)) !== -1) continue;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        const line = lines[i]!;
        const match = re.exec(line);
        if (match) {
          count++;
          yield { path: filePath, line: i + 1, column: match.index + 1, lineText: line, matchLength: match[0].length };
          if (count >= maxResults) return;
        }
      }
    }
  }

  async usage(): Promise<{ bytesUsed: number; bytesAvailable: number | null }> {
    if (typeof navigator.storage?.estimate === "function") {
      const est = await navigator.storage.estimate();
      return { bytesUsed: est.usage ?? 0, bytesAvailable: est.quota ?? null };
    }
    return { bytesUsed: 0, bytesAvailable: null };
  }
}
