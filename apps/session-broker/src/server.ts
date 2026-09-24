import express from "express";
import { createServer } from "node:http";
import { initSchema, pool } from "./db.js";
import { createSession, findActiveSessionForUser, reapExpiredSessions, SessionLimitError, type SessionRecord } from "./sessions.js";
import { proxyHttpRequest, proxyUpgrade } from "./proxy.js";
import { resolveAccount } from "./account-auth.js";

const app = express();
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// "Open Knox" requires a GitHub sign-in on apps/api (see account-auth.ts: the two services share
// a cookie domain, so one sign-in gates both products), and proxy.ts re-checks that same sign-in,
// plus ownership, on every request to the session itself. Identity for the abuse caps below
// stays (real client IP, FingerprintJS visitor id) as a second layer on top of the account - see
// docs/cloud-runtime.md for why this stands in for TLS/JA3 fingerprinting, which needs a
// Cloudflare plan this project isn't paying for.
function sessionResponse(session: SessionRecord): { sessionId: string; url: string | null; expiresAt: string } {
  const domain = process.env.KNOX_SESSION_DOMAIN;
  return {
    sessionId: session.id,
    url: domain ? `https://${session.id}.${domain}/` : null,
    expiresAt: session.expiresAt.toISOString(),
  };
}

app.post("/api/sessions", async (req, res) => {
  const account = await resolveAccount(req.headers.cookie);
  if (!account) {
    res.status(401).json({ error: "Sign in to start a session.", signInRequired: true });
    return;
  }

  const ip = req.header("cf-connecting-ip") ?? req.ip ?? "unknown";
  const fingerprintId = typeof req.body?.fingerprintId === "string" ? req.body.fingerprintId : null;
  if (!fingerprintId) {
    res.status(400).json({ error: "fingerprintId is required" });
    return;
  }

  try {
    const running = await findActiveSessionForUser(account.userId);
    if (running) {
      res.status(200).json({ ...sessionResponse(running), resumed: true });
      return;
    }
    const session = await createSession(ip, fingerprintId, account.userId);
    res.status(201).json(sessionResponse(session));
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
