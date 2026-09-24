import httpProxy from "http-proxy";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { lookupActiveSession, stopSessionNow } from "./sessions.js";
import { resolveAccount, signInUrl, stripSessionCookie } from "./account-auth.js";

// The one path this proxy answers itself instead of forwarding to code-server - code-server has
// no such endpoint, and every other path under a session's subdomain is meant to reach it
// untouched. Namespaced under /__knox/ so it can never collide with a real code-server asset path.
const END_SESSION_PATH = "/__knox/end-session";

// Where the countdown sends the browser once a session is over (naturally or via "End session") -
// there's nothing left to look at on a torn-down container, so staying put just shows a dead page.
const HOME_URL = process.env.KNOX_HOME_URL ?? "https://knox.procd.cc/";

// Routed by SUBDOMAIN (<sessionId>.<KNOX_SESSION_DOMAIN>), not a URL path prefix - code-server
// serves a full VS Code web app with hardcoded absolute asset paths (/stable-<hash>/out/...),
// so proxying it under a shared-domain path would need real path-rewriting for every asset and
// every websocket the extension host opens. A dedicated subdomain per session means code-server
// never knows it's behind a path prefix at all - it just thinks it's being served at its own
// domain root, which is exactly true from its point of view.
const SESSION_DOMAIN = process.env.KNOX_SESSION_DOMAIN ?? "";

const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });
proxy.on("error", (err, _req, res) => {
  if (res && "writeHead" in res && !res.headersSent) {
    (res as ServerResponse).writeHead(502, { "Content-Type": "text/plain" });
    (res as ServerResponse).end("Session unreachable - it may have expired.");
  }
});

// Injects a small floating countdown into the ONE response that loads code-server's page shell
// (its own client-side app never does a full navigation after that, so this survives the whole
// session). Marked per-request via a property on `req` itself - `req` is unique per call, so
// this can't leak between concurrent sessions' requests sharing this one proxy instance.
interface CountdownRequest extends IncomingMessage {
  __knoxExpiresAt?: string;
}

// code-server serves a strict CSP (script-src limited to 'self' plus specific sha256 hashes -
// no 'unsafe-inline'), so a plain injected <script> is silently blocked by the browser and the
// countdown just freezes at its initial value. This exact text is hashed below and the hash is
// added to the proxied response's own CSP header, rather than weakening the policy generally -
// verified against a real session's CSP violation report before landing this.
const COUNTDOWN_SCRIPT_BODY = `(function () {
  var expiresAt = new Date(window.__knoxExpiresAt).getTime();
  var el = document.getElementById("knox-session-countdown-time");
  var box = document.getElementById("knox-session-countdown");
  var endBtn = document.getElementById("knox-session-end");
  // A message with nothing after it just leaves the user staring at a dead container - the
  // whole point of ending is to send them somewhere that still does something.
  function ended(message) {
    box.innerHTML = "";
    box.textContent = message;
    box.style.color = "#ffb4a8";
    clearInterval(timer);
    setTimeout(function () {
      window.location.href = "${HOME_URL}";
    }, 2500);
  }
  endBtn.addEventListener("mouseenter", function () {
    endBtn.style.background = "#ffffff26";
    endBtn.style.borderColor = "#ffffff66";
  });
  endBtn.addEventListener("mouseleave", function () {
    endBtn.style.background = "transparent";
    endBtn.style.borderColor = "#ffffff40";
  });
  function tick() {
    var remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      ended("Knox session ended - it was stopped after 15 minutes.");
      return;
    }
    var totalSeconds = Math.floor(remainingMs / 1000);
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    el.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    if (remainingMs < 60000) box.style.color = "#ffb4a8";
  }
  var timer = setInterval(tick, 1000);
  tick();
  endBtn.addEventListener("click", function () {
    endBtn.disabled = true;
    endBtn.textContent = "Ending…";
    fetch("${END_SESSION_PATH}", { method: "POST" })
      .then(function () {
        ended("Knox session ended.");
      })
      .catch(function () {
        endBtn.disabled = false;
        endBtn.textContent = "End session";
      });
  });
})();`;

const COUNTDOWN_SCRIPT_HASH = `'sha256-${createHash("sha256").update(COUNTDOWN_SCRIPT_BODY, "utf8").digest("base64")}'`;

function countdownSnippet(expiresAtIso: string): { html: string; extraHashes: readonly string[] } {
  // The expiry timestamp itself goes on a separate, tiny inline script (its own hash, computed
  // per-session) rather than being templated into COUNTDOWN_SCRIPT_BODY - that keeps the main
  // script's text (and therefore its hash) identical across every session.
  const setExpiry = `window.__knoxExpiresAt=${JSON.stringify(expiresAtIso)};`;
  const setExpiryHash = `'sha256-${createHash("sha256").update(setExpiry, "utf8").digest("base64")}'`;
  return {
    html: `<div id="knox-session-countdown" style="position:fixed;bottom:14px;right:14px;z-index:2147483647;display:flex;align-items:center;gap:10px;font:500 12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:#1a1a1acc;color:#f2ede6;padding:7px 8px 7px 12px;border-radius:7px;border:1px solid #ffffff26;backdrop-filter:blur(6px);pointer-events:none;"><span>Knox session · <span id="knox-session-countdown-time">15:00</span></span><button id="knox-session-end" type="button" style="pointer-events:auto;cursor:pointer;font:inherit;background:transparent;border:1px solid #ffffff40;color:#f2ede6;border-radius:5px;padding:4px 9px;transition:background 0.15s ease,border-color 0.15s ease;">End session</button></div>
<script>${setExpiry}</script>
<script>${COUNTDOWN_SCRIPT_BODY}</script>`,
    extraHashes: [setExpiryHash, COUNTDOWN_SCRIPT_HASH],
  } as const;
}

function allowScriptHashesInCsp(csp: string, hashes: readonly string[]): string {
  // No trailing path segment after the variable, no rewriting of anything else in the
  // directive - just widen script-src by appending our two hashes to whatever it already lists.
  return csp.replace(/script-src([^;]*)/, (_match, rest: string) => `script-src${rest} ${hashes.join(" ")}`);
}

proxy.on("proxyRes", (proxyRes, req, res) => {
  const expiresAt = (req as CountdownRequest).__knoxExpiresAt;
  if (!expiresAt) return; // not the flagged root-document request - let normal piping happen

  const chunks: Buffer[] = [];
  proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
  proxyRes.on("end", () => {
    const contentType = proxyRes.headers["content-type"] ?? "";
    let body = Buffer.concat(chunks);
    const headers = { ...proxyRes.headers };
    if (proxyRes.statusCode === 200 && contentType.includes("text/html")) {
      const html = body.toString("utf8");
      const { html: snippet, extraHashes } = countdownSnippet(expiresAt);
      body = Buffer.from(html.includes("</body>") ? html.replace("</body>", `${snippet}</body>`) : html + snippet, "utf8");
      const csp = headers["content-security-policy"];
      if (typeof csp === "string") {
        headers["content-security-policy"] = allowScriptHashesInCsp(csp, extraHashes);
      }
    }
    headers["content-length"] = String(body.byteLength);
    delete headers["content-encoding"]; // forced to `identity` below, so none to declare here
    res.writeHead(proxyRes.statusCode ?? 200, headers);
    res.end(body);
  });
});

export function extractSessionId(host: string | undefined, sessionDomain: string): string | null {
  if (!host || !sessionDomain) return null;
  const bareHost = host.split(":")[0];
  if (!bareHost || !bareHost.endsWith(`.${sessionDomain}`)) return null;
  return bareHost.slice(0, -(sessionDomain.length + 1));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Authorization =
  | { kind: "not-a-session" }
  | { kind: "sign-in" }
  | { kind: "forbidden" }
  | { kind: "ok"; sessionId: string; target: string; expiresAt: string };

/** The gate in front of every VS Code session: the request must carry a Knox sign-in, and that
 * account must be the one that started this session. A session's URL alone grants nothing - it
 * ends up in browser history, screenshots, and shared screens, and a session subdomain serves
 * user-controlled content (code-server's /proxy/<port>/), so letting anyone else's browser load
 * it would also hand that content a same-site foothold against the visitor. */
export async function authorizeSessionRequest(host: string | undefined, cookieHeader: string | undefined): Promise<Authorization> {
  const sessionId = extractSessionId(host, SESSION_DOMAIN);
  if (!sessionId || !UUID_RE.test(sessionId)) return { kind: "not-a-session" };
  const session = await lookupActiveSession(sessionId);
  if (!session) return { kind: "not-a-session" };
  const account = await resolveAccount(cookieHeader);
  if (!account) return { kind: "sign-in" };
  // Sessions started before sign-in was required have no owner - nobody can prove it's theirs.
  if (!session.userId || session.userId !== account.userId) return { kind: "forbidden" };
  return { kind: "ok", sessionId, target: `http://${session.publicIp}:8080`, expiresAt: session.expiresAt.toISOString() };
}

function isNavigation(req: IncomingMessage): boolean {
  const mode = req.headers["sec-fetch-mode"];
  if (typeof mode === "string") return mode === "navigate";
  return (req.method === "GET" || req.method === "HEAD") && (req.headers.accept ?? "").includes("text/html");
}

function noticePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title} - Knox</title>
<style>:root{color-scheme:dark light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0e;color:#d8dadd;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
@media (prefers-color-scheme: light){body{background:#f4f2ef;color:#24262b}}main{max-width:420px;padding:24px}h1{font-size:19px;margin:0 0 8px}p{margin:0 0 20px;opacity:.75}
a{display:inline-block;background:#c1602f;color:#fff6f0;text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:6px}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="${HOME_URL}">Back to Knox</a></main></body></html>`;
}

/** Answers a request that didn't pass authorizeSessionRequest. Returns false when the host isn't
 * a live session at all, so the caller can fall through to the broker's own routes. */
function rejectHttp(auth: Authorization, req: IncomingMessage, res: ServerResponse): boolean {
  if (auth.kind === "not-a-session" || auth.kind === "ok") return false;
  res.setHeader("Cache-Control", "no-store");
  if (auth.kind === "sign-in") {
    const target = signInUrl(`https://${req.headers.host}${req.url ?? "/"}`);
    if (target && isNavigation(req)) {
      res.writeHead(302, { Location: target });
      res.end();
      return true;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sign in to use this session." }));
    return true;
  }
  if (isNavigation(req)) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(noticePage("This isn't your session", "Each Knox session belongs to the account that started it. Start your own from the Knox home page."));
    return true;
  }
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "This session belongs to another account." }));
  return true;
}

function forwardWithoutKnoxCookie(req: IncomingMessage): void {
  const stripped = stripSessionCookie(req.headers.cookie);
  if (stripped) req.headers.cookie = stripped;
  else delete req.headers.cookie;
}

export async function proxyHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const auth = await authorizeSessionRequest(req.headers.host, req.headers.cookie);
  if (auth.kind !== "ok") return rejectHttp(auth, req, res);

  if (req.method === "POST" && (req.url ?? "").split("?")[0] === END_SESSION_PATH) {
    try {
      await stopSessionNow(auth.sessionId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to end session ${auth.sessionId} on request:`, err);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Could not end the session. It will still stop on its own at the time limit." }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  forwardWithoutKnoxCookie(req);
  const isRootDocument = req.url === "/" || (req.url ?? "").startsWith("/?");
  if (isRootDocument) {
    (req as CountdownRequest).__knoxExpiresAt = auth.expiresAt;
    // Force an uncompressed response so the countdown injection above can safely treat the
    // proxied body as plain UTF-8 text instead of needing to detect and decompress gzip/br.
    req.headers["accept-encoding"] = "identity";
  }
  proxy.web(req, res, { target: auth.target, selfHandleResponse: isRootDocument });
  return true;
}

export async function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<boolean> {
  const auth = await authorizeSessionRequest(req.headers.host, req.headers.cookie);
  if (auth.kind === "not-a-session") return false;
  if (auth.kind !== "ok") {
    socket.end(auth.kind === "sign-in" ? "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n" : "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return true;
  }
  forwardWithoutKnoxCookie(req);
  proxy.ws(req, socket, head, { target: auth.target });
  return true;
}
