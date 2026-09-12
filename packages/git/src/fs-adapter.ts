import type { VirtualFileSystem } from "@knox/shared";
import { FileSystemError } from "@knox/shared";

function toErrno(err: unknown): Error & { code: string } {
  const code = err instanceof FileSystemError && err.code === "NOT_FOUND" ? "ENOENT" : "EIO";
  return Object.assign(new Error(err instanceof Error ? err.message : String(err)), { code });
}

function makeStat(type: "file" | "dir", size: number, mtimeMs: number) {
  return {
    type,
    mode: type === "dir" ? 0o40000 : 0o100644,
    size,
    ino: 0,
    mtimeMs,
    ctimeMs: mtimeMs,
    uid: 1,
    gid: 1,
    dev: 1,
    isFile: () => type === "file",
    isDirectory: () => type === "dir",
    isSymbolicLink: () => false,
  };
}

/** Adapts VirtualFileSystem to the fs.promises shape isomorphic-git expects. */
export function createGitFs(vfs: VirtualFileSystem) {
  return {
    promises: {
      async readFile(filepath: string, opts?: { encoding?: string }) {
        try {
          const bytes = await vfs.readFile(filepath);
          return opts?.encoding === "utf8" ? new TextDecoder().decode(bytes) : bytes;
        } catch (err) {
          throw toErrno(err);
        }
      },
      async writeFile(filepath: string, data: Uint8Array | string) {
        await vfs.writeFile(filepath, data);
      },
      async unlink(filepath: string) {
        try {
          await vfs.delete(filepath, { recursive: false });
        } catch (err) {
          throw toErrno(err);
        }
      },
      async readdir(filepath: string) {
        try {
          const entries = await vfs.readdir(filepath);
          return entries.map((e) => e.name);
        } catch (err) {
          throw toErrno(err);
        }
      },
      async mkdir(filepath: string) {
        await vfs.mkdir(filepath, { recursive: true });
      },
      async rmdir(filepath: string) {
        try {
          await vfs.delete(filepath, { recursive: true });
        } catch (err) {
          throw toErrno(err);
        }
      },
      async stat(filepath: string) {
        try {
          const s = await vfs.stat(filepath);
          return makeStat(s.type === "directory" ? "dir" : "file", s.size, s.mtime);
        } catch (err) {
          throw toErrno(err);
        }
      },
      async lstat(filepath: string) {
        return this.stat(filepath);
      },
      // No symlink support; isomorphic-git requires these to exist even when unused.
      async readlink(): Promise<never> {
        throw Object.assign(new Error("readlink not supported"), { code: "ENOSYS" });
      },
      async symlink(): Promise<never> {
        throw Object.assign(new Error("symlink not supported"), { code: "ENOSYS" });
      },
    },
  };
}
