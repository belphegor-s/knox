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
import { openDb, reqToPromise, txDone } from "./idb.js";
import { matchesAny } from "./glob.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

interface EntryRecord {
  path: string;
  parentPath: string;
  type: "file" | "directory";
  size: number;
  mtime: number;
  ctime: number;
  version: string;
}

const ENTRIES = "entries";
const CONTENTS = "contents";

// Fallback VirtualFileSystem when OPFS is unavailable.
export class IndexedDbFileSystem implements VirtualFileSystem {
  readonly id: string;
  private readonly changeEmitter = new Emitter<FileChangeEvent>();
  private versionCounter = 0;
  private lastMtime = 0;

  private constructor(
    workspaceId: string,
    private readonly db: IDBDatabase,
  ) {
    this.id = workspaceId;
  }

  static async create(workspaceId: string): Promise<IndexedDbFileSystem> {
    const db = await openDb(`knox-vfs-${workspaceId}`, 1, (db) => {
      const entries = db.createObjectStore(ENTRIES, { keyPath: "path" });
      entries.createIndex("byParent", "parentPath");
      db.createObjectStore(CONTENTS, { keyPath: "path" });
    });
    const fs = new IndexedDbFileSystem(workspaceId, db);
    await fs.ensureRoot();
    return fs;
  }

  private async ensureRoot(): Promise<void> {
    const existing = await this.getEntry("/");
    if (!existing) {
      const tx = this.db.transaction(ENTRIES, "readwrite");
      tx.objectStore(ENTRIES).put({
        path: "/",
        parentPath: "",
        type: "directory",
        size: 0,
        mtime: Date.now(),
        ctime: Date.now(),
        version: "root",
      } satisfies EntryRecord);
      await txDone(tx);
    }
  }

  private async getEntry(path: string): Promise<EntryRecord | undefined> {
    const tx = this.db.transaction(ENTRIES, "readonly");
    return reqToPromise(tx.objectStore(ENTRIES).get(normalizePath(path)));
  }

  private toStat(entry: EntryRecord): FileStat {
    return {
      type: entry.type,
      size: entry.size,
      mtime: entry.mtime,
      ctime: entry.ctime,
      version: entry.version,
      readonly: false,
    };
  }

  async readFile(path: string): Promise<Uint8Array> {
    const norm = normalizePath(path);
    const entry = await this.getEntry(norm);
    if (!entry) throw new FileSystemError(`No such file: ${norm}`, "NOT_FOUND", norm);
    if (entry.type !== "file") throw new FileSystemError(`Is a directory: ${norm}`, "IS_A_DIRECTORY", norm);
    const tx = this.db.transaction(CONTENTS, "readonly");
    const record = await reqToPromise<{ path: string; data: Uint8Array } | undefined>(
      tx.objectStore(CONTENTS).get(norm),
    );
    return record?.data ?? new Uint8Array();
  }

  async readTextFile(path: string): Promise<string> {
    return textDecoder.decode(await this.readFile(path));
  }

  async writeFile(path: string, data: Uint8Array | string, options?: WriteOptions): Promise<FileStat> {
    const norm = normalizePath(path);
    const existing = await this.getEntry(norm);
    if (options?.ifMatch && existing && existing.version !== options.ifMatch) {
      throw new FileSystemError(`Concurrent modification: ${norm}`, "CONFLICT", norm);
    }
    if (existing?.type === "directory") {
      throw new FileSystemError(`Is a directory: ${norm}`, "IS_A_DIRECTORY", norm);
    }
    if (options?.recursive !== false) {
      await this.mkdirInternal(dirname(norm), true);
    }
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    // Monotonic: Date.now() alone can repeat across fast same-tick writes, which breaks
    // consumers (like git status) that trust mtime to detect same-size content changes.
    const now = Math.max(Date.now(), this.lastMtime + 1);
    this.lastMtime = now;
    const entry: EntryRecord = {
      path: norm,
      parentPath: dirname(norm),
      type: "file",
      size: bytes.byteLength,
      mtime: now,
      ctime: existing?.ctime ?? now,
      version: `${now}-${bytes.byteLength}-${this.versionCounter++}`,
    };
    const tx = this.db.transaction([ENTRIES, CONTENTS], "readwrite");
    tx.objectStore(ENTRIES).put(entry);
    tx.objectStore(CONTENTS).put({ path: norm, data: bytes });
    await txDone(tx);
    this.changeEmitter.fire({ type: existing ? "modified" : "created", path: norm });
    return this.toStat(entry);
  }

  private async mkdirInternal(path: string, recursive: boolean): Promise<void> {
    const norm = normalizePath(path);
    if (norm === "/") return;
    const existing = await this.getEntry(norm);
    if (existing) {
      if (existing.type !== "directory") {
        throw new FileSystemError(`Not a directory: ${norm}`, "NOT_A_DIRECTORY", norm);
      }
      return;
    }
    const parent = dirname(norm);
    if (recursive) await this.mkdirInternal(parent, true);
    else if (!(await this.getEntry(parent))) {
      throw new FileSystemError(`No such directory: ${parent}`, "NOT_FOUND", parent);
    }
    const now = Date.now();
    const tx = this.db.transaction(ENTRIES, "readwrite");
    tx.objectStore(ENTRIES).put({
      path: norm,
      parentPath: parent,
      type: "directory",
      size: 0,
      mtime: now,
      ctime: now,
      version: "dir",
    } satisfies EntryRecord);
    await txDone(tx);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.mkdirInternal(path, options?.recursive ?? true);
    this.changeEmitter.fire({ type: "created", path: normalizePath(path) });
  }

  async delete(path: string, options?: { recursive?: boolean }): Promise<void> {
    const norm = normalizePath(path);
    const entry = await this.getEntry(norm);
    if (!entry) throw new FileSystemError(`No such file or directory: ${norm}`, "NOT_FOUND", norm);
    const children = entry.type === "directory" ? await this.readdir(norm) : [];
    if (children.length > 0 && !options?.recursive) {
      throw new FileSystemError(`Directory not empty: ${norm}`, "CONFLICT", norm);
    }
    const tx = this.db.transaction([ENTRIES, CONTENTS], "readwrite");
    const entriesStore = tx.objectStore(ENTRIES);
    const contentsStore = tx.objectStore(CONTENTS);
    const toDelete = await reqToPromise(entriesStore.getAll());
    const prefix = norm === "/" ? "/" : `${norm}/`;
    for (const record of toDelete as EntryRecord[]) {
      if (record.path === norm || record.path.startsWith(prefix)) {
        entriesStore.delete(record.path);
        contentsStore.delete(record.path);
      }
    }
    await txDone(tx);
    this.changeEmitter.fire({ type: "deleted", path: norm });
  }

  async copy(from: string, to: string): Promise<void> {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    const entry = await this.getEntry(src);
    if (!entry) throw new FileSystemError(`No such file or directory: ${src}`, "NOT_FOUND", src);
    if (entry.type === "directory") {
      await this.mkdir(dst, { recursive: true });
      for (const child of await this.readdir(src)) {
        await this.copy(`${src}/${child.name}`, `${dst}/${child.name}`);
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
    return !!(await this.getEntry(path));
  }

  async stat(path: string): Promise<FileStat> {
    const norm = normalizePath(path);
    const entry = await this.getEntry(norm);
    if (!entry) throw new FileSystemError(`No such file or directory: ${norm}`, "NOT_FOUND", norm);
    return this.toStat(entry);
  }

  async readdir(path: string, options?: ReaddirOptions): Promise<FileEntry[]> {
    const norm = normalizePath(path);
    const entry = await this.getEntry(norm);
    if (!entry) throw new FileSystemError(`No such directory: ${norm}`, "NOT_FOUND", norm);
    if (entry.type !== "directory") throw new FileSystemError(`Not a directory: ${norm}`, "NOT_A_DIRECTORY", norm);
    const tx = this.db.transaction(ENTRIES, "readonly");
    const index = tx.objectStore(ENTRIES).index("byParent");
    const children = (await reqToPromise(index.getAll(norm))) as EntryRecord[];
    const result: FileEntry[] = children
      .map((c) => ({ name: basename(c.path), type: c.type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (options?.recursive) {
      const nested: FileEntry[] = [];
      for (const child of result) {
        if (child.type === "directory") {
          const sub = await this.readdir(`${norm === "/" ? "" : norm}/${child.name}`, options);
          for (const s of sub) nested.push({ name: `${child.name}/${s.name}`, type: s.type });
        }
      }
      result.push(...nested);
    }
    return result;
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
    const tx = this.db.transaction(ENTRIES, "readonly");
    const all = (await reqToPromise(tx.objectStore(ENTRIES).getAll())) as EntryRecord[];
    let count = 0;
    const maxResults = options?.maxResults ?? 1000;
    for (const entry of all) {
      if (options?.signal?.aborted) return;
      if (entry.type !== "file") continue;
      if (options?.include && !matchesAny(entry.path, options.include)) continue;
      if (options?.exclude && matchesAny(entry.path, options.exclude)) continue;
      let text: string;
      try {
        text = await this.readTextFile(entry.path);
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
          yield { path: entry.path, line: i + 1, column: match.index + 1, lineText: line, matchLength: match[0].length };
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
