import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedDbFileSystem } from "@knox/filesystem";
import { Shell } from "../shell.js";

const { runScript, runRemote } = vi.hoisted(() => ({
  runScript: vi.fn(),
  runRemote: vi.fn(),
}));
vi.mock("@knox/runtime", async () => {
  const actual = await vi.importActual<typeof import("@knox/runtime")>("@knox/runtime");
  return { ...actual, runScript, runRemote };
});

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

  it("clear emits the ANSI clear-screen escape sequence", async () => {
    const out = capture();
    const code = await shell.execute("clear", out.write);
    expect(code).toBe(0);
    expect(out.out).toBe("\x1b[2J\x1b[H");
  });

  it("ll lists entries with type and size", async () => {
    await vfs.writeFile("/a.txt", "hello");
    const out = capture();
    await shell.execute("mkdir sub", out.write);
    await shell.execute("ll", out.write);
    expect(out.out).toContain("a.txt");
    expect(out.out).toContain("sub/");
    expect(out.out).toMatch(/^- +5 {2}a\.txt$/m);
    expect(out.out).toMatch(/^d -\s+sub\/$/m);
  });

  it("grep finds matching lines across files", async () => {
    await vfs.writeFile("/a.txt", "hello world\nsecond line");
    await vfs.writeFile("/b.txt", "nothing here");
    const out = capture();
    const code = await shell.execute("grep world", out.write);
    expect(code).toBe(0);
    expect(out.out).toContain("a.txt:1: hello world");
    expect(out.out).not.toContain("b.txt");
  });

  it("grep reports no matches with a nonzero exit code", async () => {
    await vfs.writeFile("/a.txt", "nothing interesting");
    const out = capture();
    const code = await shell.execute("grep zzzz", out.write);
    expect(code).toBe(1);
    expect(out.err).toContain("no matches");
  });

  it("find locates files by name substring", async () => {
    await vfs.writeFile("/src/auth.ts", "");
    await vfs.writeFile("/src/util.ts", "");
    const out = capture();
    await shell.execute("find auth", out.write);
    expect(out.out.trim()).toBe("/src/auth.ts");
  });

  describe("run", () => {
    beforeEach(() => {
      runScript.mockReset();
      runRemote.mockReset();
    });

    it("rejects a file with no recognized extension without touching either executor", async () => {
      await vfs.writeFile("/data.bin", "");
      const out = capture();
      const code = await shell.execute("run data.bin", out.write);
      expect(code).toBe(1);
      expect(out.err).toContain("unrecognized extension");
      expect(runScript).not.toHaveBeenCalled();
      expect(runRemote).not.toHaveBeenCalled();
    });

    it("runs .js/.ts files locally via runScript, never touching the network path", async () => {
      await vfs.writeFile("/main.ts", "console.log(1)");
      runScript.mockResolvedValue({ exitCode: 0, durationMs: 1, timedOut: false });
      const out = capture();
      const code = await shell.execute("run main.ts", out.write);
      expect(code).toBe(0);
      expect(runScript).toHaveBeenCalledWith(expect.objectContaining({ language: "typescript", code: "console.log(1)" }));
      expect(runRemote).not.toHaveBeenCalled();
    });

    it("routes non-JS/TS languages to the cloud executor with filename and code", async () => {
      await vfs.writeFile("/main.py", "print(1)");
      runRemote.mockResolvedValue({ exitCode: 0, durationMs: 1, timedOut: false, unavailable: false });
      const out = capture();
      const code = await shell.execute("run main.py", out.write);
      expect(code).toBe(0);
      expect(runRemote).toHaveBeenCalledWith(expect.objectContaining({ language: "python", filename: "main.py", code: "print(1)" }));
    });

    it("shows the honest capability reason when the cloud executor is unreachable", async () => {
      await vfs.writeFile("/main.cpp", "int main(){}");
      runRemote.mockResolvedValue({ exitCode: 1, durationMs: 1, timedOut: false, unavailable: true });
      const out = capture();
      const code = await shell.execute("run main.cpp", out.write);
      expect(code).toBe(1);
      expect(out.err).toContain("cloud execution service");
    });
  });

  describe("complete", () => {
    it("completes a builtin command name", async () => {
      const candidates = await shell.complete("ec");
      expect(candidates).toEqual(["echo"]);
    });

    it("lists all builtins for an empty first word", async () => {
      const candidates = await shell.complete("");
      expect(candidates).toContain("ls");
      expect(candidates).toContain("cd");
    });

    it("completes a filename argument from the current directory", async () => {
      await vfs.writeFile("/hello.txt", "");
      await vfs.writeFile("/help-notes.md", "");
      const candidates = await shell.complete("cat hel");
      expect(candidates.sort()).toEqual(["hello.txt", "help-notes.md"]);
    });

    it("marks directories with a trailing slash", async () => {
      await vfs.mkdir("/src");
      const candidates = await shell.complete("cd sr");
      expect(candidates).toEqual(["src/"]);
    });

    it("completes within a subdirectory path", async () => {
      await vfs.writeFile("/src/auth.ts", "");
      const candidates = await shell.complete("cat src/au");
      expect(candidates).toEqual(["src/auth.ts"]);
    });

    it("returns nothing for a path with no matches", async () => {
      const candidates = await shell.complete("cat zzz");
      expect(candidates).toEqual([]);
    });
  });
});
