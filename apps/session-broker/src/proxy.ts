import httpProxy from "http-proxy";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { lookupActiveSession, stopSessionNow } from "./sessions.js";

// The one path this proxy answers itself instead of forwarding to code-server - code-server has
// no such endpoint, and every other path under a session's subdomain is meant to reach it
// untouched. Namespaced under /__knox/ so it can never collide with a real code-server asset path.
const END_SESSION_PATH = "/__knox/end-session";

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
  function ended(message) {
    box.innerHTML = "";
    box.textContent = message;
    box.style.color = "#ffb4a8";
    clearInterval(timer);
  }
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
    html: `<div id="knox-session-countdown" style="position:fixed;bottom:14px;right:14px;z-index:2147483647;display:flex;align-items:center;gap:10px;font:500 12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:#1a1a1acc;color:#f2ede6;padding:7px 8px 7px 12px;border-radius:7px;border:1px solid #ffffff26;backdrop-filter:blur(6px);pointer-events:none;"><span>Knox session · <span id="knox-session-countdown-time">15:00</span></span><button id="knox-session-end" type="button" style="pointer-events:auto;cursor:pointer;font:inherit;background:transparent;border:1px solid #ffffff40;color:#f2ede6;border-radius:5px;padding:4px 9px;">End session</button></div>
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

async function resolveSession(host: string | undefined): Promise<{ target: string; expiresAt: string } | null> {
  const sessionId = extractSessionId(host, SESSION_DOMAIN);
  if (!sessionId) return null;
  const session = await lookupActiveSession(sessionId);
  return session ? { target: `http://${session.publicIp}:8080`, expiresAt: session.expiresAt.toISOString() } : null;
}

export async function proxyHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const sessionId = extractSessionId(req.headers.host, SESSION_DOMAIN);
  if (sessionId && req.method === "POST" && (req.url ?? "").split("?")[0] === END_SESSION_PATH) {
    try {
      await stopSessionNow(sessionId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to end session ${sessionId} on request:`, err);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Could not end the session. It will still stop on its own at the time limit." }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  const resolved = await resolveSession(req.headers.host);
  if (!resolved) return false;

  const isRootDocument = req.url === "/" || (req.url ?? "").startsWith("/?");
  if (isRootDocument) {
    (req as CountdownRequest).__knoxExpiresAt = resolved.expiresAt;
    // Force an uncompressed response so the countdown injection above can safely treat the
    // proxied body as plain UTF-8 text instead of needing to detect and decompress gzip/br.
    req.headers["accept-encoding"] = "identity";
  }
  proxy.web(req, res, { target: resolved.target, selfHandleResponse: isRootDocument });
  return true;
}

export async function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<boolean> {
  const resolved = await resolveSession(req.headers.host);
  if (!resolved) return false;
  proxy.ws(req, socket, head, { target: resolved.target });
  return true;
}
