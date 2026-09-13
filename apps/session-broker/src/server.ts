import express from "express";
import { createServer } from "node:http";
import { initSchema, pool } from "./db.js";
import { createSession, reapExpiredSessions, SessionLimitError } from "./sessions.js";
import { proxyHttpRequest, proxyUpgrade } from "./proxy.js";

const app = express();
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// The public, no-login "Open Knox" entry point. Identity for the abuse caps below is (real
// client IP, FingerprintJS visitor id) - see docs/cloud-runtime.md for why this stands in for
// TLS/JA3 fingerprinting, which needs a Cloudflare plan this project isn't paying for.
app.post("/api/sessions", async (req, res) => {
  const ip = req.header("cf-connecting-ip") ?? req.ip ?? "unknown";
  const fingerprintId = typeof req.body?.fingerprintId === "string" ? req.body.fingerprintId : null;
  if (!fingerprintId) {
    res.status(400).json({ error: "fingerprintId is required" });
    return;
  }

  try {
    const session = await createSession(ip, fingerprintId);
    const domain = process.env.KNOX_SESSION_DOMAIN;
    res.status(201).json({
      sessionId: session.id,
      url: domain ? `https://${session.id}.${domain}/?password=${session.password}` : null,
      password: session.password,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof SessionLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("Failed to create session:", err);
    res.status(503).json({ error: "Could not start a session right now. Try again in a moment." });
  }
});

const server = createServer((req, res) => {
  void proxyHttpRequest(req, res).then((handled) => {
    if (!handled) app(req, res);
  });
});

// Express itself never sees WebSocket upgrade requests - they arrive on the underlying
// http.Server's own "upgrade" event, which is why this is wired here rather than as
// middleware. code-server's terminal and live editing both depend on this working.
server.on("upgrade", (req, socket, head) => {
  void proxyUpgrade(req, socket, head).then((handled) => {
    if (!handled) socket.destroy();
  });
});

const REAP_INTERVAL_MS = 30_000;
setInterval(() => {
  reapExpiredSessions().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Session reaper failed:", err);
  });
}, REAP_INTERVAL_MS).unref();

const port = Number(process.env.PORT) || 8083;
initSchema()
  .then(() => {
    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Knox session broker listening on :${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  void pool.end();
  server.close();
});
