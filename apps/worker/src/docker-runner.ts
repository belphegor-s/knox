import { spawn } from "node:child_process";
import type { SupportedLanguage } from "./languages.js";

export type OutputWriter = (stream: "stdout" | "stderr", text: string) => void;

export interface RunOptions {
  language: SupportedLanguage;
  filename: string;
  code: string;
  onOutput: OutputWriter;
}

const RUNNER_IMAGE = process.env.KNOX_RUNNER_IMAGE ?? "knox-runner:latest";
const WALL_CLOCK_TIMEOUT_MS = 30_000;

/** Runs untrusted, user-submitted source in a throwaway, sandboxed container - never on this
 * host process directly. Every flag below narrows what that code can touch; removing one
 * re-opens a real escape (network exfiltration, resource exhaustion, host filesystem access). */
export function runInContainer({ language, filename, code, onOutput }: RunOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--memory",
      "256m",
      "--memory-swap",
      "256m",
      "--cpus",
      "1",
      "--pids-limit",
      "128",
      "--read-only",
      "--tmpfs",
      "/workspace:rw,exec,size=64m,mode=1777",
      "--tmpfs",
      "/tmp:rw,exec,size=64m,mode=1777",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
      "--user",
      "1000:1000",
      RUNNER_IMAGE,
      language,
      filename,
    ];

    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let settled = false;

    // Backstop in case the container (or docker itself) hangs - the in-container `timeout`
    // wrapping the actual program is the first line of defense; this is what fires if that
    // fails for any reason (a compiler hang, a stuck docker daemon call, etc).
    const killTimer = setTimeout(() => {
      onOutput("stderr", "\nExecution timed out (server-side limit).\n");
      child.kill("SIGKILL");
    }, WALL_CLOCK_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => onOutput("stdout", chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => onOutput("stderr", chunk.toString("utf8")));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(code ?? 1);
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}
