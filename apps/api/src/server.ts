import express from "express";
import { isRateLimited, pruneRateLimitState } from "./rate-limit.js";
import { initSchema } from "./db.js";
import {
  createMagicLink,
  consumeMagicLink,
  createSession,
  resolveSession,
  destroySession,
  parseCookies,
  sessionCookieHeader,
  clearSessionCookieHeader,
  sanitizeRedirectTarget,
  SESSION_COOKIE_NAME,
} from "./auth.js";
import { sendMagicLinkEmail } from "./email.js";
import { createApiKey, listApiKeys, revokeApiKey, resolveApiKey } from "./api-keys.js";
import { assertWithinUsageCaps, logExecution, getUsageSummary, UsageLimitError } from "./usage.js";
import { loginPageHtml, dashboardPageHtml } from "./pages.js";
import { isSupportedLanguage, validateFilename } from "./languages.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const WORKER_URL = process.env.KNOX_WORKER_URL ?? "http://localhost:8082";
const EXECUTE_LIMIT_PER_MINUTE = 10;
// The 2-minute cap the product spec asks for - passed to the worker per request rather than
// being that service's own default, so the old unauthenticated /api/execute (used by the
// browser terminal's `run` command) keeps its short interactive timeout unless it asks
// otherwise, while every /v1/execute call always asks for the full cap.
const V1_EXECUTE_TIMEOUT_MS = 120_000;

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// The account/API-key/execution-logging feature (this whole section, plus /v1/execute below)
// needs a database; the original /api/execute proxy below does not and must keep working with
// zero configuration for a plain self-hosted `docker compose --profile cloud-execution up` -
// that's the base deployment, and it should never start failing because of a feature nobody
// asked for. So this is opt-in on DATABASE_URL being set, not a hard requirement at boot.
const HAS_DATABASE = Boolean(process.env.DATABASE_URL);
app.use(["/auth", "/account", "/v1"], (_req, res, next) => {
  if (!HAS_DATABASE) {
    res.status(503).json({ error: "This deployment doesn't have the account/API-key feature configured." });
    return;
  }
  next();
});

function sessionTokenFrom(req: express.Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
}

async function requireSession(req: express.Request, res: express.Response): Promise<{ userId: string; email: string } | null> {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }
  return session;
}

// ---- account: magic-link auth + dashboard --------------------------------------------------

// Only /auth/request-link needs CORS: it's the one route a browser on a *different* procd.cc
// subdomain (knox.procd.cc's own sign-in prompt, gating VS Code sessions the same way as API
// keys) calls directly. Everything else either renders its own page (same-origin navigation,
// no CORS involved) or is called server-to-server (session-broker's /auth/whoami check, which
// browsers never touch and CORS doesn't apply to anyway).
const COOKIE_DOMAIN_SUFFIX = (process.env.KNOX_COOKIE_DOMAIN ?? "").replace(/^\./, "");
app.post("/auth/request-link", (req, res, next) => {
  const origin = req.header("origin");
  if (origin && COOKIE_DOMAIN_SUFFIX) {
    try {
      const host = new URL(origin).hostname;
      if (host === COOKIE_DOMAIN_SUFFIX || host.endsWith(`.${COOKIE_DOMAIN_SUFFIX}`)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    } catch {
      /* not a valid Origin header - no CORS header set, browser blocks the response as usual */
    }
  }
  next();
});
app.options("/auth/request-link", (req, res) => {
  const origin = req.header("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  res.status(204).end();
});

app.post("/auth/request-link", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const redirect = typeof req.body?.redirect === "string" ? req.body.redirect : undefined;
  if (!email || !email.includes("@") || email.length > 320) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (isRateLimited(`magic-link:${email.toLowerCase()}`, 5, 15 * 60_000)) {
    res.status(429).json({ error: "Too many sign-in requests for this email. Try again later." });
    return;
  }
  try {
    const token = await createMagicLink(email);
    const safeRedirect = sanitizeRedirectTarget(redirect, `${req.protocol}://${req.get("host")}/account`);
    const verifyUrl = `${req.protocol}://${req.get("host")}/auth/verify?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(safeRedirect)}`;
    await sendMagicLinkEmail(email, verifyUrl);
    res.status(200).json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send magic link:", err);
    res.status(503).json({ error: "Could not send the sign-in email right now. Try again in a moment." });
  }
});

app.get("/auth/verify", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const redirectTarget = typeof req.query.redirect === "string" ? req.query.redirect : undefined;
  const userId = token ? await consumeMagicLink(token) : null;
  const fallback = `${req.protocol}://${req.get("host")}/account`;
  if (!userId) {
    const target = new URL(sanitizeRedirectTarget(redirectTarget, fallback));
    target.searchParams.set("error", "That sign-in link is invalid or has expired.");
    res.redirect(target.toString());
    return;
  }
  const { token: sessionToken, expiresAt } = await createSession(userId);
  res.setHeader("Set-Cookie", sessionCookieHeader(sessionToken, expiresAt));
  res.redirect(sanitizeRedirectTarget(redirectTarget, fallback));
});

// Service-to-service only (session-broker forwards the cookie it received here to decide
// whether to allow a VS Code session) - never called by a browser directly, so no CORS.
app.get("/auth/whoami", async (req, res) => {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.status(200).json({ userId: session.userId, email: session.email });
});

app.post("/auth/logout", async (req, res) => {
  await destroySession(sessionTokenFrom(req));
  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  res.redirect("/account");
});

app.get("/account", async (req, res) => {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(200).send(
      loginPageHtml({
        sent: req.query.sent === "1",
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
    return;
  }
  const [keys, usage] = await Promise.all([listApiKeys(session.userId), getUsageSummary(session.userId)]);
  res.status(200).send(
    dashboardPageHtml({
      email: session.email,
      keys,
      usage,
      mintedKey: typeof req.query.minted === "string" ? req.query.minted : undefined,
      error: typeof req.query.error === "string" ? req.query.error : undefined,
    }),
  );
});

app.get("/account/keys", async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  res.status(200).json({ keys: await listApiKeys(session.userId) });
});

app.post("/account/keys", async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
  if (!name) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  const { key } = await createApiKey(session.userId, name);
  res.status(201).json({ key });
});

app.delete("/account/keys/:id", async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const revoked = await revokeApiKey(session.userId, req.params.id);
  if (!revoked) {
    res.status(404).json({ error: "Key not found." });
    return;
  }
  res.status(200).json({ ok: true });
});

// ---- v1/execute: the public, API-key-authenticated execution endpoint ----------------------

app.post("/v1/execute", async (req, res) => {
  const authHeader = req.header("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const apiKey = await resolveApiKey(rawKey);
  if (!apiKey) {
    res.status(401).json({ error: "Missing or invalid API key. Pass it as 'Authorization: Bearer knox_live_...'." });
    return;
  }

  try {
    await assertWithinUsageCaps(apiKey.userId);
  } catch (err) {
    if (err instanceof UsageLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    throw err;
  }

  const { language, filename, code } = req.body ?? {};
  if (typeof language !== "string" || !isSupportedLanguage(language)) {
    res.status(400).json({ error: `Unsupported language: ${String(language)}. Supported: python, c, cpp, java, go, rust.` });
    return;
  }
  if (typeof filename !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "Request must include filename and code as strings." });
    return;
  }
  if (code.length > 200_000) {
    res.status(413).json({ error: "Source is too large (200KB limit)." });
    return;
  }
  const filenameError = validateFilename(language, filename);
  if (filenameError) {
    res.status(400).json({ error: filenameError });
    return;
  }

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${WORKER_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, filename, code, timeoutMs: V1_EXECUTE_TIMEOUT_MS }),
    });
  } catch {
    res.status(503).json({ error: "Execution service is unavailable." });
    return;
  }

  // The worker streams NDJSON events (one process's worth of stdout/stderr/exit) - collected
  // here into a single JSON response, since API consumers expect one result per call, not a
  // stream, and a run's total output is bounded (200KB source, sandboxed process) so buffering
  // it is fine even at the full 2-minute cap.
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  if (upstream.body) {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line) as { type: string; data?: string; code?: number };
          if (event.type === "stdout") stdout += event.data ?? "";
          else if (event.type === "stderr") stderr += event.data ?? "";
          else if (event.type === "exit") exitCode = event.code ?? null;
        } catch {
          /* ignore a malformed line rather than fail the whole response over it */
        }
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  await logExecution(apiKey.id, language, exitCode, durationMs).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to log execution:", err);
  });

  res.status(upstream.ok ? 200 : upstream.status).json({ stdout, stderr, exitCode, durationMs });
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
  // Without this, Express holds these headers until the first res.write() below - which for a
  // backend that batches all its output until the run finishes (apps/worker/src/ecs-runner.ts,
  // as opposed to docker-runner.ts's live stdout/stderr piping) could be a minute or more away.
  // A client can't distinguish "server never responded" from "server is still computing" until
  // it at least sees these, so flush them immediately once the upstream is confirmed reachable.
  res.flushHeaders();

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
(HAS_DATABASE ? initSchema() : Promise.resolve())
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Knox API listening on :${port}${HAS_DATABASE ? "" : " (account/API-key feature disabled: no DATABASE_URL)"}`);
    });
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
