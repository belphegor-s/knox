import { joinPath, normalizePath, type VirtualFileSystem } from "@knox/shared";
import { getCapabilities, runRemote, runScript } from "@knox/runtime";

export type Writer = (stream: "stdout" | "stderr", text: string) => void;

const BUILTIN_COMMANDS = ["pwd", "cd", "ls", "ll", "cat", "echo", "mkdir", "touch", "rm", "cp", "mv", "grep", "find", "run", "node", "clear", "help"];

// What `run <file>` knows how to execute at all, by extension. javascript/typescript run
// locally (packages/runtime); everything else goes to the optional cloud execution service
// and falls back to an honest "not available" message if nothing is deployed there.
const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  java: "java",
  go: "go",
  rs: "rust",
};

function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** A small POSIX-ish shell over VirtualFileSystem - real commands, not a fake prompt. */
export class Shell {
  cwd = "/";

  constructor(private readonly vfs: VirtualFileSystem) {}

  resolve(p: string): string {
    if (!p) return this.cwd;
    return p.startsWith("/") ? normalizePath(p) : joinPath(this.cwd, p);
  }

  /** Tab-completion candidates for the word under the cursor - real command names and real directory listings, not a canned list. */
  async complete(line: string): Promise<string[]> {
    const endsWithSpace = /\s$/.test(line);
    const tokens = tokenize(line);
    const onFirstWord = tokens.length === 0 || (tokens.length === 1 && !endsWithSpace);

    if (onFirstWord) {
      const partial = tokens[0] ?? "";
      return BUILTIN_COMMANDS.filter((c) => c.startsWith(partial));
    }

    const partial = endsWithSpace ? "" : (tokens[tokens.length - 1] ?? "");
    const lastSlash = partial.lastIndexOf("/");
    const dirPart = lastSlash === -1 ? "" : partial.slice(0, lastSlash + 1);
    const namePart = lastSlash === -1 ? partial : partial.slice(lastSlash + 1);
    try {
      const entries = await this.vfs.readdir(this.resolve(dirPart || "."));
      return entries
        .filter((e) => e.name.startsWith(namePart))
        .map((e) => `${dirPart}${e.name}${e.type === "directory" ? "/" : ""}`);
    } catch {
      return [];
    }
  }

  async execute(line: string, write: Writer): Promise<number> {
    const [cmd, ...rest] = tokenize(line);
    if (!cmd) return 0;
    try {
      return await this.run(cmd, rest, write);
    } catch (err) {
      write("stderr", `${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  private async run(cmd: string, rest: string[], write: Writer): Promise<number> {
    switch (cmd) {
      case "pwd":
        write("stdout", `${this.cwd}\n`);
        return 0;
      case "cd": {
        const target = this.resolve(rest[0] ?? "/");
        const stat = await this.vfs.stat(target).catch(() => null);
        if (!stat || stat.type !== "directory") {
          write("stderr", `cd: no such directory: ${rest[0] ?? "/"}\n`);
          return 1;
        }
        this.cwd = target;
        return 0;
      }
      case "ls": {
        const target = this.resolve(rest.find((a) => !a.startsWith("-")) ?? "");
        const entries = await this.vfs.readdir(target);
        write("stdout", `${entries.map((e) => (e.type === "directory" ? `${e.name}/` : e.name)).join("  ")}\n`);
        return 0;
      }
      case "cat": {
        if (rest.length === 0) {
          write("stderr", "cat: missing file operand\n");
          return 1;
        }
        for (const f of rest) {
          const text = await this.vfs.readTextFile(this.resolve(f));
          write("stdout", text.endsWith("\n") ? text : `${text}\n`);
        }
        return 0;
      }
      case "echo":
        write("stdout", `${rest.join(" ")}\n`);
        return 0;
      case "mkdir":
        for (const d of rest) await this.vfs.mkdir(this.resolve(d));
        return 0;
      case "touch":
        for (const f of rest) {
          const p = this.resolve(f);
          if (!(await this.vfs.exists(p))) await this.vfs.writeFile(p, "");
        }
        return 0;
      case "rm": {
        const recursive = rest.includes("-r") || rest.includes("-rf");
        for (const f of rest.filter((a) => !a.startsWith("-"))) await this.vfs.delete(this.resolve(f), { recursive });
        return 0;
      }
      case "cp":
        if (rest.length < 2) {
          write("stderr", "cp: missing operand\n");
          return 1;
        }
        await this.vfs.copy(this.resolve(rest[0]!), this.resolve(rest[1]!));
        return 0;
      case "mv":
        if (rest.length < 2) {
          write("stderr", "mv: missing operand\n");
          return 1;
        }
        await this.vfs.move(this.resolve(rest[0]!), this.resolve(rest[1]!));
        return 0;
      case "node":
      case "run": {
        if (rest.length === 0) {
          write("stderr", `${cmd}: missing file operand\n`);
          return 1;
        }
        const path = this.resolve(rest[0]!);
        const filename = path.split("/").pop() ?? path;
        const ext = filename.split(".").pop()?.toLowerCase() ?? "";
        const language = EXTENSION_LANGUAGE[ext];
        if (!language) {
          write("stderr", `${cmd}: don't know how to run "${filename}" (unrecognized extension)\n`);
          return 1;
        }
        const code = await this.vfs.readTextFile(path);

        if (language === "javascript" || language === "typescript") {
          const result = await runScript({ language, code, onOutput: write });
          if (result.timedOut) write("stderr", "Execution timed out.\n");
          return result.exitCode;
        }

        // Printed before the request even starts - a cloud-backed run can take a minute or
        // more (Fargate cold start, see docs/cloud-runtime.md), and runRemote() itself doesn't
        // emit anything until either the backend responds or the whole thing fails, so without
        // this the terminal just sits there silently the entire time, indistinguishable from
        // being frozen.
        write("stdout", `Running ${filename} in the cloud (this can take a minute on a cold start)...\n`);
        const remote = await runRemote({ language, filename, code, onOutput: write });
        if (remote.unavailable) {
          write("stderr", `${getCapabilities(language).unavailableReason}\n`);
          return 1;
        }
        if (remote.timedOut) write("stderr", "Execution timed out.\n");
        return remote.exitCode;
      }
      case "clear":
        // Real terminals clear by emitting the ANSI escape sequence, not a client-side special case.
        write("stdout", "\x1b[2J\x1b[H");
        return 0;
      case "ll": {
        const target = this.resolve(rest.find((a) => !a.startsWith("-")) ?? "");
        const entries = await this.vfs.readdir(target);
        const lines = await Promise.all(
          entries.map(async (e) => {
            const stat = await this.vfs.stat(joinPath(target, e.name));
            const kind = e.type === "directory" ? "d" : "-";
            const size = e.type === "directory" ? "-" : String(stat.size).padStart(8);
            const name = e.type === "directory" ? `${e.name}/` : e.name;
            return `${kind} ${size}  ${name}`;
          }),
        );
        write("stdout", `${lines.join("\n")}\n`);
        return 0;
      }
      case "grep": {
        if (rest.length < 1) {
          write("stderr", "grep: usage: grep <pattern> [path]\n");
          return 1;
        }
        const [pattern, target] = rest;
        let found = 0;
        for await (const match of this.vfs.search(pattern!, { include: target ? [`${target.replace(/^\//, "")}`] : undefined })) {
          write("stdout", `${match.path}:${match.line}: ${match.lineText.trim()}\n`);
          found++;
        }
        if (found === 0) write("stderr", `grep: no matches for "${pattern}"\n`);
        return found === 0 ? 1 : 0;
      }
      case "find": {
        const namePattern = rest[0];
        if (!namePattern) {
          write("stderr", "find: usage: find <name-substring>\n");
          return 1;
        }
        const matches: string[] = [];
        async function walk(vfs: VirtualFileSystem, dir: string): Promise<void> {
          const entries = await vfs.readdir(dir);
          for (const e of entries) {
            const p = joinPath(dir, e.name);
            if (e.name.includes(namePattern!)) matches.push(p);
            if (e.type === "directory") await walk(vfs, p);
          }
        }
        await walk(this.vfs, this.cwd);
        write("stdout", matches.length > 0 ? `${matches.join("\n")}\n` : "");
        return 0;
      }
      case "help":
        write(
          "stdout",
          "Commands: pwd cd ls ll cat echo mkdir touch rm cp mv grep find run <file.js|.ts> clear help\n" +
            "Editing: Tab completes commands/paths, Ctrl+A/E, Ctrl+K/U, Option+Left/Right/Backspace, Ctrl+W, Up/Down history\n",
        );
        return 0;
      default:
        write("stderr", `${cmd}: command not found\n`);
        return 127;
    }
  }
}
