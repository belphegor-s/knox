import ts from "typescript";

// Best-effort network block for executed code; this worker has no DOM/window
// access already, which is the main isolation boundary (SPEC section 11).
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "importScripts"]) {
  try {
    (self as unknown as Record<string, unknown>)[name] = undefined;
  } catch {
    /* some globals are non-configurable; best effort */
  }
}

interface RunMessage {
  language: "javascript" | "typescript";
  code: string;
}

function send(stream: "stdout" | "stderr", text: string): void {
  postMessage({ type: "output", stream, text });
}

self.addEventListener("message", async (event: MessageEvent<RunMessage>) => {
  const { language, code } = event.data;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => send("stdout", `${args.map(formatArg).join(" ")}\n`);
  console.warn = console.error = (...args: unknown[]) => send("stderr", `${args.map(formatArg).join(" ")}\n`);
  console.info = console.log;

  try {
    const js = language === "typescript" ? ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText : code;
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => () => Promise<unknown>;
    const run = new AsyncFunction(js);
    await run();
    postMessage({ type: "done", exitCode: 0 });
  } catch (err) {
    send("stderr", `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    postMessage({ type: "done", exitCode: 1 });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
