import express from "express";
import { isRateLimited, pruneRateLimitState } from "./rate-limit.js";
import { initSchema } from "./db.js";
import {
  beginGithubSignIn,
  checkOauthState,
  clearOauthStateCookieHeader,
  fetchGithubProfile,
  upsertGithubUser,
  isGithubConfigured,
  createSession,
  resolveSession,
  destroySession,
  pruneExpiredAuthState,
  parseCookies,
  sessionCookieHeader,
  clearSessionCookieHeader,
  sanitizeRedirectTarget,
  isTrustedOrigin,
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  type Account,
} from "./auth.js";
import { createApiKey, listApiKeys, revokeApiKey, resolveApiKey } from "./api-keys.js";
import { assertWithinUsageCaps, logExecution, getUsageSummary, UsageLimitError } from "./usage.js";
import { loginPageHtml, dashboardPageHtml } from "./pages.js";
import { getApiOverview } from "./overview.js";
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
app.use(["/auth", "/account", "/admin", "/v1"], (_req, res, next) => {
  if (!HAS_DATABASE) {
    res.status(503).json({ error: "This deployment doesn't have the account/API-key feature configured." });
    return;
  }
  next();
});

function sessionTokenFrom(req: express.Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
}

async function requireSession(req: express.Request, res: express.Response): Promise<Account | null> {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }
  return session;
}

// ---- account: GitHub sign-in + dashboard ----------------------------------------------------

// The OAuth callback URL has to match what's registered on the GitHub OAuth app byte for byte,
// so it comes from configuration rather than being rebuilt from the request - behind Traefik/
// Cloudflare, req.protocol is "http" and would silently produce a mismatched redirect_uri.
function publicBaseUrl(req: express.Request): string {
  return (process.env.KNOX_API_PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function signInErrorRedirect(target: string, message: string): string {
  const url = new URL(target);
  url.searchParams.set("auth_error", message);
  return url.toString();
}

app.get("/auth/github", (req, res) => {
  const base = publicBaseUrl(req);
  const redirect = sanitizeRedirectTarget(typeof req.query.redirect === "string" ? req.query.redirect : undefined, `${base}/account`);
  if (!isGithubConfigured()) {
    res.status(503).send("GitHub sign-in isn't configured on this deployment (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).");
    return;
  }
  const { authorizeUrl, stateCookie } = beginGithubSignIn(`${base}/auth/github/callback`, redirect);
  res.setHeader("Set-Cookie", stateCookie);
  res.setHeader("Cache-Control", "no-store");
  res.redirect(authorizeUrl);
});

app.get("/auth/github/callback", async (req, res) => {
  const base = publicBaseUrl(req);
  const fallback = `${base}/account`;
  const state = checkOauthState(parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE_NAME], typeof req.query.state === "string" ? req.query.state : undefined);
  res.setHeader("Set-Cookie", clearOauthStateCookieHeader());
  res.setHeader("Cache-Control", "no-store");
  if (!state) {
    res.redirect(signInErrorRedirect(fallback, "That sign-in attempt expired or didn't start here. Try again."));
    return;
  }
  const redirect = sanitizeRedirectTarget(state.redirect, fallback);
  if (typeof req.query.error === "string") {
    // access_denied is the user clicking Cancel on GitHub's consent screen - not an error worth
    // shouting about, but still worth saying why they're back without being signed in.
    res.redirect(signInErrorRedirect(redirect, req.query.error === "access_denied" ? "GitHub sign-in was cancelled." : "GitHub sign-in failed. Try again."));
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.redirect(signInErrorRedirect(redirect, "GitHub sign-in failed. Try again."));
    return;
  }
  try {
    const profile = await fetchGithubProfile(code, `${base}/auth/github/callback`);
    const userId = await upsertGithubUser(profile);
    const { token, expiresAt } = await createSession(userId);
    res.setHeader("Set-Cookie", [clearOauthStateCookieHeader(), sessionCookieHeader(token, expiresAt)]);
    res.redirect(redirect);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GitHub sign-in failed:", err);
    res.redirect(signInErrorRedirect(redirect, "GitHub sign-in failed. Try again."));
  }
});

// Service-to-service (session-broker forwards the cookie it received to decide whether to
// allow a VS Code session; infra/nginx.conf's auth_request gate for /app/ does the same) - no
// CORS, a browser has no reason to call this directly. /auth/me below is the browser's version.
app.get("/auth/whoami", async (req, res) => {
  const session = await resolveSession(sessionTokenFrom(req));
  res.setHeader("Cache-Control", "no-store");
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.status(200).json({ userId: session.userId, email: session.email, login: session.githubLogin, isAdmin: session.isAdmin });
});

// Read from knox.procd.cc (a different origin): /auth/me by the landing page to show who's
// signed in, /admin/* by the overview page. Credentialed CORS, so the allowed origin has to be
// echoed exactly - never "*" - and only for https origins on the cookie domain.
app.use(["/auth/me", "/admin"], (req, res, next) => {
  const origin = req.header("origin");
  if (origin && isTrustedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/auth/me", async (req, res) => {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.status(200).json({ login: session.githubLogin, name: session.name, email: session.email, avatarUrl: session.avatarUrl, isAdmin: session.isAdmin });
});

// The account/API half of the admin overview - see overview.ts. Admins are listed by GitHub id
// in KNOX_ADMIN_GITHUB_IDS; a signed-in non-admin gets 403, not 404, so the page can say so.
app.get("/admin/overview", async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  if (!session.isAdmin) {
    res.status(403).json({ error: "Your account isn't an admin on this deployment." });
    return;
  }
  try {
    res.status(200).json(await getApiOverview());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to build overview:", err);
    res.status(500).json({ error: "Could not load account and API numbers." });
  }
});

// A plain form POST from either the account page or the landing page (same-site, so the Lax
// session cookie is sent) - `redirect` lets the landing page's own Sign out land back on itself.
app.post("/auth/logout", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
  await destroySession(sessionTokenFrom(req));
  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  const redirect = typeof req.body?.redirect === "string" ? req.body.redirect : undefined;
  res.redirect(303, sanitizeRedirectTarget(redirect, "/account"));
});

app.get("/account", async (req, res) => {
  const session = await resolveSession(sessionTokenFrom(req));
  if (!session) {
    res.status(200).send(
      loginPageHtml({
        signInUrl: `/auth/github?redirect=${encodeURIComponent(`${publicBaseUrl(req)}/account`)}`,
        error: typeof req.query.auth_error === "string" ? req.query.auth_error : undefined,
      }),
    );
    return;
  }
  const [keys, usage] = await Promise.all([listApiKeys(session.userId), getUsageSummary(session.userId)]);
  res.status(200).send(
    dashboardPageHtml({
      account: session,
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
  await logExecution({ userId: apiKey.userId, apiKeyId: apiKey.id, source: "api", language, exitCode, durationMs }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to log execution:", err);
  });

  res.status(upstream.ok ? 200 : upstream.status).json({ stdout, stderr, exitCode, durationMs });
});

// The route the in-browser IDE's `run` command uses (same-origin via infra/nginx.conf's /api/
// proxy, which forwards the browser's cookies unchanged). It runs arbitrary user code, so once
// accounts exist on this deployment it requires a signed-in session like everything else; a
// database-less self-hosted deployment has no accounts to check and keeps it open, relying on
// the per-client rate limit on top of the worker's own per-request resource caps.
app.post("/api/execute", async (req, res) => {
  let rateLimitKey = req.ip ?? "unknown";
  let userId: string | null = null;
  if (HAS_DATABASE) {
    const session = await resolveSession(sessionTokenFrom(req));
    if (!session) {
      res.status(401).json({ error: "Sign in at knox.procd.cc to run code in the cloud." });
      return;
    }
    userId = session.userId;
    rateLimitKey = `user:${session.userId}`;
  }
  if (isRateLimited(rateLimitKey, EXECUTE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many execution requests. Try again in a minute." });
    return;
  }

  const startedAt = Date.now();
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

  const language = typeof req.body?.language === "string" ? req.body.language.slice(0, 32) : "unknown";
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
  // Passed through to the browser unchanged as it arrives; the exit event is also picked out
  // of the NDJSON on the way past, so the run can be logged with its result.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let exitCode: number | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    res.write(text);
    pending += text;
    let newlineIndex: number;
    while ((newlineIndex = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      if (!line.includes('"exit"')) continue;
      try {
        const event = JSON.parse(line) as { type?: string; code?: number };
        if (event.type === "exit") exitCode = event.code ?? null;
      } catch {
        /* not an event line - nothing to record */
      }
    }
  }
  res.end();

  if (userId && upstream.ok) {
    await logExecution({ userId, apiKeyId: null, source: "ide", language, exitCode, durationMs: Date.now() - startedAt }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Failed to log execution:", err);
    });
  }
});

// Catch-all: any request that didn't match a route above. A signed-in user hitting a dead or
// stale link (an old bookmark, a typo'd path) stands more to gain from landing on their
// dashboard than from a bare 404 - so only a GET, and only once there's an actual session to
// send them to, redirects; everything else (no session, or a non-GET) falls through to the
// normal 404. Placed last on purpose - Express only reaches this once nothing above matched.
app.use(async (req, res) => {
  if (req.method === "GET" && HAS_DATABASE) {
    const session = await resolveSession(sessionTokenFrom(req));
    if (session) {
      res.redirect("/account");
      return;
    }
  }
  res.status(404).send("Not found");
});

setInterval(() => pruneRateLimitState(60_000), 60_000).unref();
if (HAS_DATABASE) {
  setInterval(() => {
    pruneExpiredAuthState().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Failed to prune expired sessions:", err);
    });
  }, 60 * 60_000).unref();
}

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
