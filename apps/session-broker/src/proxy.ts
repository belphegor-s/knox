import httpProxy from "http-proxy";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { lookupActiveSession } from "./sessions.js";

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

export function extractSessionId(host: string | undefined, sessionDomain: string): string | null {
  if (!host || !sessionDomain) return null;
  const bareHost = host.split(":")[0];
  if (!bareHost || !bareHost.endsWith(`.${sessionDomain}`)) return null;
  return bareHost.slice(0, -(sessionDomain.length + 1));
}

async function resolveTarget(host: string | undefined): Promise<string | null> {
  const sessionId = extractSessionId(host, SESSION_DOMAIN);
  if (!sessionId) return null;
  const session = await lookupActiveSession(sessionId);
  return session ? `http://${session.publicIp}:8080` : null;
}

export async function proxyHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const target = await resolveTarget(req.headers.host);
  if (!target) return false;
  proxy.web(req, res, { target });
  return true;
}

export async function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<boolean> {
  const target = await resolveTarget(req.headers.host);
  if (!target) return false;
  proxy.ws(req, socket, head, { target });
  return true;
}
