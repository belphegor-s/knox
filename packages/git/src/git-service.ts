import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { diffLines } from "diff";
import type { VirtualFileSystem } from "@knox/shared";
import { createGitFs } from "./fs-adapter.js";
import type { GitAuth, GitAuthor, GitBranchInfo, GitCommitInfo, GitDiffHunk, GitFileStatus, GitFileStatusCode } from "./types.js";

const DEFAULT_AUTHOR: GitAuthor = { name: "Knox User", email: "user@knox.local" };

// isomorphic-git's statusMatrix [head, workdir, stage] -> our status (see its README table).
function classify(head: number, workdir: number, stage: number): { status: GitFileStatusCode; staged: boolean } {
  if (head === 0 && workdir === 2 && stage === 0) return { status: "untracked", staged: false };
  if (head === 0 && (stage === 2 || stage === 3)) return { status: "added", staged: true };
  if (head === 1 && workdir === 0) return { status: "deleted", staged: stage === 0 };
  if (head === 1 && workdir === 2) return { status: "modified", staged: stage === 2 || stage === 3 };
  return { status: "unmodified", staged: false };
}

export class GitService {
  private readonly fs: ReturnType<typeof createGitFs>;
  private readonly dir = "/";

  constructor(vfs: VirtualFileSystem) {
    this.fs = createGitFs(vfs);
  }

  async isRepo(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await git.init({ fs: this.fs, dir: this.dir, defaultBranch: "main" });
  }

  async clone(url: string, opts?: { corsProxy?: string; ref?: string; depth?: number }): Promise<void> {
    await git.clone({
      fs: this.fs,
      http,
      dir: this.dir,
      url,
      corsProxy: opts?.corsProxy,
      ref: opts?.ref,
      singleBranch: true,
      depth: opts?.depth ?? 1,
    });
  }

  async status(): Promise<GitFileStatus[]> {
    const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
    const out: GitFileStatus[] = [];
    for (const [path, head, workdir, stage] of matrix) {
      const { status, staged } = classify(head, workdir, stage);
      if (status !== "unmodified") out.push({ path, status, staged });
    }
    return out;
  }

  async add(paths: string[]): Promise<void> {
    for (const p of paths) await git.add({ fs: this.fs, dir: this.dir, filepath: p.replace(/^\//, "") });
  }

  async unstage(paths: string[]): Promise<void> {
    for (const p of paths) await git.resetIndex({ fs: this.fs, dir: this.dir, filepath: p.replace(/^\//, "") });
  }

  async discard(paths: string[], vfs: VirtualFileSystem): Promise<void> {
    for (const p of paths) {
      try {
        const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid: await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" }), filepath: p.replace(/^\//, "") });
        await vfs.writeFile(p, blob);
      } catch {
        await vfs.delete(p, { recursive: false }).catch(() => {});
      }
    }
  }

  async commit(message: string, author: GitAuthor = DEFAULT_AUTHOR): Promise<string> {
    return git.commit({ fs: this.fs, dir: this.dir, message, author });
  }

  async currentBranch(): Promise<string | null> {
    const branch = await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false });
    return branch ?? null;
  }

  async listBranches(): Promise<GitBranchInfo[]> {
    const [branches, current] = await Promise.all([
      git.listBranches({ fs: this.fs, dir: this.dir }),
      this.currentBranch(),
    ]);
    return branches.map((name) => ({ name, current: name === current }));
  }

  async createBranch(name: string, checkout = true): Promise<void> {
    await git.branch({ fs: this.fs, dir: this.dir, ref: name, checkout });
  }

  async checkout(ref: string): Promise<void> {
    await git.checkout({ fs: this.fs, dir: this.dir, ref });
  }

  async log(depth = 50): Promise<GitCommitInfo[]> {
    const commits = await git.log({ fs: this.fs, dir: this.dir, depth });
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message.replace(/\n$/, ""),
      author: c.commit.author.name,
      email: c.commit.author.email,
      timestamp: c.commit.author.timestamp * 1000,
    }));
  }

  async diffFile(path: string, vfs: VirtualFileSystem): Promise<GitDiffHunk[]> {
    const filepath = path.replace(/^\//, "");
    let oldText = "";
    try {
      const oid = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
      const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
      oldText = new TextDecoder().decode(blob);
    } catch {
      oldText = "";
    }
    const newText = await vfs.readTextFile(path).catch(() => "");
    return diffLines(oldText, newText).map((part) => ({
      type: part.added ? "add" : part.removed ? "remove" : "context",
      lines: part.value.replace(/\n$/, "").split("\n"),
    }));
  }

  async fetch(opts?: { corsProxy?: string }): Promise<void> {
    await git.fetch({ fs: this.fs, http, dir: this.dir, corsProxy: opts?.corsProxy });
  }

  async pull(author: GitAuthor = DEFAULT_AUTHOR, opts?: { corsProxy?: string }): Promise<void> {
    await git.pull({ fs: this.fs, http, dir: this.dir, author, corsProxy: opts?.corsProxy });
  }

  async push(opts?: { corsProxy?: string; auth?: GitAuth }): Promise<void> {
    await git.push({
      fs: this.fs,
      http,
      dir: this.dir,
      corsProxy: opts?.corsProxy,
      onAuth: opts?.auth ? () => opts.auth! : undefined,
    });
  }

  async merge(theirs: string, author: GitAuthor = DEFAULT_AUTHOR): Promise<{ conflicted: boolean }> {
    try {
      await git.merge({ fs: this.fs, dir: this.dir, ours: (await this.currentBranch()) ?? "main", theirs, author });
      return { conflicted: false };
    } catch (err) {
      if (err instanceof Error && err.name === "MergeNotSupportedError") return { conflicted: true };
      throw err;
    }
  }
}
