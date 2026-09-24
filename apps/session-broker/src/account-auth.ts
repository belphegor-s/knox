import { createHash } from "node:crypto";

// Session-broker has no user/auth database of its own - it defers to apps/api as the single
// source of truth for "who is signed in", by forwarding the session cookie the browser sent it.
// This only works because apps/api scopes that cookie to the parent domain (KNOX_COOKIE_DOMAIN,
// e.g. ".procd.cc") - one GitHub sign-in reaches knox.procd.cc, knox-api.procd.cc, and every
// <sessionId>.procd.cc VS Code subdomain alike.
const ACCOUNT_API_URL = process.env.KNOX_ACCOUNT_API_URL;
// Where a browser is sent to sign in - the account API's PUBLIC origin. Often the same value as
// KNOX_ACCOUNT_API_URL, but that one may be an internal address the browser can't reach.
const ACCOUNT_PUBLIC_URL = (process.env.KNOX_ACCOUNT_PUBLIC_URL ?? ACCOUNT_API_URL ?? "").replace(/\/$/, "");

export const SESSION_COOKIE_NAME = "knox_session";

export interface Account {
  userId: string;
  email: string;
  login: string | null;
}

// Every VS Code asset, websocket, and extension-host request passes through the proxy - a cold
// code-server load alone is a few hundred requests. Asking apps/api about each one would add a
// network round trip per asset, so a positive answer is remembered briefly. The cost is that a
// sign-out takes up to this long to reach an already-open VS Code tab, which is fine for a
// session that's capped at 15 minutes anyway. Negative answers are never cached: someone who just
// signed in must not be bounced for another minute.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 5_000;
const cache = new Map<string, { account: Account; expiresAt: number }>();

export function sessionTokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value || null;
    }
  }
  return null;
}

/** The Cookie header with Knox's own session cookie removed - what code-server gets to see. The
 * container runs whatever the user puts in it, and nothing inside it needs the account session
 * that also authorizes API-key management. */
export function stripSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return cookieHeader;
  const kept = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const eq = part.indexOf("=");
      return (eq === -1 ? part : part.slice(0, eq)).trim() !== SESSION_COOKIE_NAME;
    });
  return kept.length > 0 ? kept.join("; ") : undefined;
}

export async function resolveAccount(cookieHeader: string | undefined): Promise<Account | null> {
  const token = sessionTokenFromCookieHeader(cookieHeader);
  if (!ACCOUNT_API_URL || !token) return null;

  const key = createHash("sha256").update(token, "utf8").digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.account;

  try {
    // Only the session cookie is forwarded, not the browser's whole Cookie header.
    const res = await fetch(`${ACCOUNT_API_URL}/auth/whoami`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    if (!res.ok) {
      cache.delete(key);
      return null;
    }
    const body = (await res.json()) as { userId?: string; email?: string; login?: string | null };
    if (!body.userId || !body.email) return null;
    const account: Account = { userId: body.userId, email: body.email, login: body.login ?? null };
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
      if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    }
    cache.set(key, { account, expiresAt: Date.now() + CACHE_TTL_MS });
    return account;
  } catch {
    return null;
  }
}

/** Where to send a browser that isn't signed in: GitHub sign-in on the account API, landing back
 * on `returnTo` afterwards (apps/api only honours https targets on the cookie domain). */
export function signInUrl(returnTo: string): string | null {
  if (!ACCOUNT_PUBLIC_URL) return null;
  return `${ACCOUNT_PUBLIC_URL}/auth/github?redirect=${encodeURIComponent(returnTo)}`;
}
