import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDbFileSystem } from "@knox/filesystem";
import { Shell } from "../shell.js";

let seq = 0;
async function freshShell(): Promise<{ shell: Shell; vfs: IndexedDbFileSystem }> {
  seq++;
  const vfs = await IndexedDbFileSystem.create(`shell-test-${seq}-${Date.now()}`);
  return { shell: new Shell(vfs), vfs };
}

function capture(): { write: (s: "stdout" | "stderr", t: string) => void; out: string; err: string } {
  const state = { out: "", err: "" };
  return {
    write: (stream, text) => {
      if (stream === "stdout") state.out += text;
      else state.err += text;
    },
    get out() {
      return state.out;
    },
    get err() {
      return state.err;
    },
  };
}

describe("Shell", () => {
  let shell: Shell;
  let vfs: IndexedDbFileSystem;

  beforeEach(async () => {
    ({ shell, vfs } = await freshShell());
  });

  it("echoes and reports pwd", async () => {
    const out = capture();
    await shell.execute("echo hi there", out.write);
    expect(out.out).toBe("hi there\n");
    await shell.execute("pwd", out.write);
    expect(out.out).toContain("/\n");
  });

  it("creates directories and lists them", async () => {
    const out = capture();
    await shell.execute("mkdir src", out.write);
    await shell.execute("ls", out.write);
    expect(out.out).toContain("src/");
  });

  it("changes directory and resolves relative paths", async () => {
    const out = capture();
    await shell.execute("mkdir src", out.write);
    const code = await shell.execute("cd src", out.write);
    expect(code).toBe(0);
    expect(shell.cwd).toBe("/src");
  });

  it("fails to cd into a missing directory", async () => {
    const out = capture();
    const code = await shell.execute("cd nope", out.write);
    expect(code).toBe(1);
    expect(out.err).toContain("no such directory");
  });

  it("writes and reads files via touch/cat", async () => {
    await vfs.writeFile("/a.txt", "hello");
    const out = capture();
    await shell.execute("cat a.txt", out.write);
    expect(out.out).toBe("hello\n");
  });

  it("removes files recursively", async () => {
    const out = capture();
    await shell.execute("mkdir dir", out.write);
    await shell.execute("touch dir/f.txt", out.write);
    await shell.execute("rm -rf dir", out.write);
    expect(await vfs.exists("/dir")).toBe(false);
  });

  it("reports unknown commands with exit code 127", async () => {
    const out = capture();
    const code = await shell.execute("notacommand", out.write);
    expect(code).toBe(127);
    expect(out.err).toContain("command not found");
  });

  it("handles quoted arguments", async () => {
    const out = capture();
    await shell.execute('echo "hello world" foo', out.write);
    expect(out.out).toBe("hello world foo\n");
  });
});
