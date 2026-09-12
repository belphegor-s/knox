import type { OutputHandler } from "./types.js";

export interface RemoteRunOptions {
  language: string;
  filename: string;
  code: string;
  onOutput?: OutputHandler;
  timeoutMs?: number;
}

export interface RemoteRunResult {
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  /** True only when no cloud execution backend answered at all (not deployed, or unreachable) -
   * the caller should fall back to its local "not supported" message in that case, but show a
   * real compiler/runtime error as-is when the backend genuinely ran the code and it failed. */
  unavailable: boolean;
}

const EXECUTE_ENDPOINT = "/api/execute";

/** Sends untrusted source to the optional cloud execution backend (apps/api -> apps/worker ->
 * a sandboxed container) for languages with no local WASM runtime. Purely additive: if nothing
 * is deployed at EXECUTE_ENDPOINT, this fails fast and cleanly rather than hanging. */
export async function runRemote({ language, filename, code, onOutput, timeoutMs = 30_000 }: RemoteRunOptions): Promise<RemoteRunResult> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(EXECUTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, filename, code }),
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    return { exitCode: 1, durationMs: performance.now() - start, timedOut, unavailable: !timedOut };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let message: string | undefined;
    try {
      message = ((await response.json()) as { error?: string }).error;
    } catch {
      // Not a structured error from our own API - most likely nothing is deployed at this
      // path (e.g. a plain 404 from the static file server, no reverse-proxy route set up).
      return { exitCode: 1, durationMs: performance.now() - start, timedOut: false, unavailable: true };
    }
    onOutput?.("stderr", `${message ?? `HTTP ${response.status}`}\n`);
    return { exitCode: 1, durationMs: performance.now() - start, timedOut: false, unavailable: false };
  }
  if (!response.body) {
    return { exitCode: 1, durationMs: performance.now() - start, timedOut: false, unavailable: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exitCode = 1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const event = JSON.parse(line) as { type: "stdout" | "stderr" | "exit"; data?: string; code?: number };
        if (event.type === "exit") exitCode = event.code ?? 1;
        else onOutput?.(event.type, event.data ?? "");
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
  return { exitCode, durationMs: performance.now() - start, timedOut: false, unavailable: false };
}
