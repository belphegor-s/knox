import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDbFileSystem } from "@knox/filesystem";
import { GitService } from "../git-service.js";

let seq = 0;
async function freshRepo(): Promise<{ vfs: IndexedDbFileSystem; git: GitService }> {
  seq++;
  const vfs = await IndexedDbFileSystem.create(`git-test-${seq}-${Date.now()}`);
  const git = new GitService(vfs);
  await git.init();
  return { vfs, git };
}

describe("GitService", () => {
  it("reports untracked files before any add", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "hello");
    const status = await git.status();
    expect(status).toEqual([{ path: "a.txt", status: "untracked", staged: false }]);
  });

  it("stages and commits a file", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "hello");
    await git.add(["a.txt"]);
    const staged = await git.status();
    expect(staged).toEqual([{ path: "a.txt", status: "added", staged: true }]);

    const oid = await git.commit("initial commit");
    expect(oid).toMatch(/^[0-9a-f]{40}$/);

    const afterCommit = await git.status();
    expect(afterCommit).toEqual([]);

    const log = await git.log();
    expect(log).toHaveLength(1);
    expect(log[0]?.message).toBe("initial commit");
  });

  it("detects modifications after a commit", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "v1");
    await git.add(["a.txt"]);
    await git.commit("v1");

    // Different size so git's stat-cache fast path can't trust a same-second, same-size write as unchanged.
    await vfs.writeFile("/a.txt", "v2 with more content");
    const status = await git.status();
    expect(status).toEqual([{ path: "a.txt", status: "modified", staged: false }]);
  });

  it("creates and switches branches", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "v1");
    await git.add(["a.txt"]);
    await git.commit("v1");

    await git.createBranch("feature", true);
    expect(await git.currentBranch()).toBe("feature");

    const branches = await git.listBranches();
    expect(branches.map((b) => b.name).sort()).toEqual(["feature", "main"]);
  });

  it("produces a line diff against HEAD", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "line1\nline2\n");
    await git.add(["a.txt"]);
    await git.commit("v1");

    await vfs.writeFile("/a.txt", "line1\nline2 changed\n");
    const hunks = await git.diffFile("/a.txt", vfs);
    expect(hunks.some((h) => h.type === "remove")).toBe(true);
    expect(hunks.some((h) => h.type === "add")).toBe(true);
  });

  it("discards a modification back to HEAD content", async () => {
    const { vfs, git } = await freshRepo();
    await vfs.writeFile("/a.txt", "original");
    await git.add(["a.txt"]);
    await git.commit("v1");

    await vfs.writeFile("/a.txt", "changed");
    await git.discard(["/a.txt"], vfs);
    expect(await vfs.readTextFile("/a.txt")).toBe("original");
  });
});
