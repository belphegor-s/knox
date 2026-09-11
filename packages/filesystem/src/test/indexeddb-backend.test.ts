import { beforeEach, describe, expect, it } from "vitest";
import { FileSystemError } from "@knox/shared";
import { IndexedDbFileSystem } from "../indexeddb-backend.js";

let seq = 0;
async function freshFs(): Promise<IndexedDbFileSystem> {
  seq++;
  return IndexedDbFileSystem.create(`test-ws-${seq}-${Date.now()}`);
}

describe("IndexedDbFileSystem", () => {
  let fs: IndexedDbFileSystem;

  beforeEach(async () => {
    fs = await freshFs();
  });

  it("writes and reads a text file, creating parent directories", async () => {
    await fs.writeFile("/src/app.ts", "console.log(1)");
    expect(await fs.readTextFile("/src/app.ts")).toBe("console.log(1)");
    expect((await fs.stat("/src")).type).toBe("directory");
  });

  it("reports NOT_FOUND for missing files", async () => {
    await expect(fs.readFile("/nope.txt")).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<FileSystemError>);
  });

  it("lists directory entries sorted by name", async () => {
    await fs.writeFile("/b.txt", "b");
    await fs.writeFile("/a.txt", "a");
    await fs.mkdir("/z-dir");
    const entries = await fs.readdir("/");
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b.txt", "z-dir"]);
  });

  it("deletes a directory recursively", async () => {
    await fs.writeFile("/dir/a.txt", "a");
    await fs.writeFile("/dir/nested/b.txt", "b");
    await fs.delete("/dir", { recursive: true });
    expect(await fs.exists("/dir")).toBe(false);
    expect(await fs.exists("/dir/nested/b.txt")).toBe(false);
  });

  it("moves a file across directories", async () => {
    await fs.writeFile("/src/old.ts", "x");
    await fs.move("/src/old.ts", "/src/lib/new.ts");
    expect(await fs.exists("/src/old.ts")).toBe(false);
    expect(await fs.readTextFile("/src/lib/new.ts")).toBe("x");
  });

  it("copies a directory tree", async () => {
    await fs.writeFile("/proj/a.txt", "a");
    await fs.writeFile("/proj/sub/b.txt", "b");
    await fs.copy("/proj", "/proj-copy");
    expect(await fs.readTextFile("/proj-copy/a.txt")).toBe("a");
    expect(await fs.readTextFile("/proj-copy/sub/b.txt")).toBe("b");
    // original untouched
    expect(await fs.readTextFile("/proj/a.txt")).toBe("a");
  });

  it("rejects writes with a stale ifMatch version", async () => {
    const stat = await fs.writeFile("/f.txt", "v1");
    await fs.writeFile("/f.txt", "v2");
    await expect(fs.writeFile("/f.txt", "v3", { ifMatch: stat.version })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("emits watch events scoped to the watched path", async () => {
    const events: string[] = [];
    const sub = fs.watch("/src", (e) => events.push(`${e.type}:${e.path}`));
    await fs.writeFile("/src/a.ts", "1");
    await fs.writeFile("/other/b.ts", "2");
    sub.dispose();
    expect(events).toEqual(["created:/src/a.ts"]);
  });

  it("finds text matches via search()", async () => {
    await fs.writeFile("/src/auth.ts", "export function login() {}\nexport function logout() {}");
    await fs.writeFile("/src/util.ts", "export function noop() {}");
    const matches = [];
    for await (const m of fs.search("function log", { regex: false })) matches.push(m);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.path).toBe("/src/auth.ts");
  });

  it("respects include/exclude globs in search", async () => {
    await fs.writeFile("/src/a.ts", "TODO: fix");
    await fs.writeFile("/dist/a.js", "TODO: fix");
    const matches = [];
    for await (const m of fs.search("TODO", { exclude: ["dist/**"] })) matches.push(m);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.path).toBe("/src/a.ts");
  });
});
