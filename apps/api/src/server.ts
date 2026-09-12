import express from "express";
import { isRateLimited, pruneRateLimitState } from "./rate-limit.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const WORKER_URL = process.env.KNOX_WORKER_URL ?? "http://localhost:8082";
const EXECUTE_LIMIT_PER_MINUTE = 10;

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// This is the one public route that runs arbitrary user code (by forwarding to the sandboxed
// worker) - rate-limited per client on top of the worker's own per-request resource caps.
app.post("/api/execute", async (req, res) => {
  if (isRateLimited(req.ip ?? "unknown", EXECUTE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many execution requests. Try again in a minute." });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${WORKER_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
  } catch {
    res.status(503).json({ error: "Execution service is unavailable." });
    return;
  }

  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");

  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value, { stream: true }));
  }
  res.end();
});

setInterval(() => pruneRateLimitState(60_000), 60_000).unref();

const port = Number(process.env.PORT) || 8081;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Knox API listening on :${port}`);
});
