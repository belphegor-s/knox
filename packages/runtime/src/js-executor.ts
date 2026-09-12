import ExecWorker from "./exec-worker.ts?worker";
import type { RunOptions, RunResult } from "./types.js";

/** Runs JS/TS in a fresh, throwaway worker per call - no state survives between runs. */
export function runScript(options: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = new ExecWorker();
    const start = performance.now();
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      worker.terminate();
      finish(1);
    }, options.timeoutMs ?? 10_000);

    function finish(exitCode: number): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve({ exitCode, durationMs: performance.now() - start, timedOut });
    }

    worker.addEventListener("message", (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "output") options.onOutput?.(msg.stream, msg.text);
      else if (msg.type === "done") finish(msg.exitCode);
    });
    worker.addEventListener("error", (event) => {
      options.onOutput?.("stderr", `${event.message}\n`);
      finish(1);
    });

    worker.postMessage({ language: options.language, code: options.code });
  });
}
