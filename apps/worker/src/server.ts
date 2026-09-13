import express from "express";
import { runExecution } from "./executor.js";
import { isSupportedLanguage, validateFilename } from "./languages.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// Absolute ceiling regardless of what a caller asks for - this is what makes "max execution
// time of 2 minutes" true no matter which route (the old unauthenticated /api/execute or the
// new API-key-gated /v1/execute) ends up calling this with a client-supplied value.
const MAX_TIMEOUT_MS = 120_000;

app.post("/execute", (req, res) => {
  const { language, filename, code, timeoutMs } = req.body ?? {};

  if (typeof language !== "string" || !isSupportedLanguage(language)) {
    res.status(400).json({ error: `Unsupported language: ${String(language)}` });
    return;
  }
  if (typeof filename !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "Request must include filename and code as strings" });
    return;
  }
  if (code.length > 200_000) {
    res.status(413).json({ error: "Source is too large (200KB limit)" });
    return;
  }
  const filenameError = validateFilename(language, filename);
  if (filenameError) {
    res.status(400).json({ error: filenameError });
    return;
  }
  const requestedTimeoutMs = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? timeoutMs : undefined;
  const clampedTimeoutMs = requestedTimeoutMs != null ? Math.min(Math.max(requestedTimeoutMs, 1000), MAX_TIMEOUT_MS) : undefined;

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const writeEvent = (event: Record<string, unknown>): void => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  runExecution({
    language,
    filename,
    code,
    timeoutMs: clampedTimeoutMs,
    onOutput: (stream, data) => writeEvent({ type: stream, data }),
  })
    .then((exitCode) => writeEvent({ type: "exit", code: exitCode }))
    .catch((err: unknown) => {
      writeEvent({ type: "stderr", data: `Execution failed: ${err instanceof Error ? err.message : String(err)}\n` });
      writeEvent({ type: "exit", code: 1 });
    })
    .finally(() => res.end());
});

const port = Number(process.env.PORT) || 8082;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Knox execution worker listening on :${port}`);
});
