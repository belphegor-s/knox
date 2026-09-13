import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "./db.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "knox_session";

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function findOrCreateUser(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [normalized]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = randomUUID();
  await pool.query("INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", [id, normalized]);
  const row = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [normalized]);
  return row.rows[0]!.id;
}

/** Returns the raw token to embed in the emailed link - only its hash is ever stored, matching
 * SPEC.md's "no secrets at rest" posture for anything bearer-token-shaped. */
export async function createMagicLink(email: string): Promise<string> {
  const userId = await findOrCreateUser(email);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  await pool.query("INSERT INTO magic_links (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), userId, expiresAt]);
  return token;
}

/** One-time use: marks the link used in the same statement that validates it, so a token
 * cannot be replayed even if the verify request is somehow made twice concurrently. */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE magic_links SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<{ userId: string; email: string } | null> {
  if (!token) return null;
  const { rows } = await pool.query<{ user_id: string; email: string }>(
    `SELECT s.user_id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? { userId: rows[0].user_id, email: rows[0].email } : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// Unset by default (host-only cookie, safe for local dev over plain HTTP) - set to ".procd.cc"
// in production so the SAME session is readable across knox.procd.cc, knox-api.procd.cc, and
// sessions.procd.cc, letting one sign-in gate both the code-execution API and VS Code sessions
// (session-broker validates it via GET /auth/whoami, forwarding the cookie it receives).
const COOKIE_DOMAIN = process.env.KNOX_COOKIE_DOMAIN;

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/${domain}; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader(): string {
  const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/${domain}; Max-Age=0`;
}

// Only ever redirect somewhere on procd.cc after a magic-link click - a caller-supplied
// redirect target is otherwise a straightforward open-redirect (the link is emailed, so an
// attacker who could get someone to click a malicious knox-api.procd.cc/auth/verify?redirect=
// link could send them anywhere after a real, successful sign-in).
export function sanitizeRedirectTarget(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    const allowedHost = COOKIE_DOMAIN ? COOKIE_DOMAIN.replace(/^\./, "") : null;
    if (url.protocol === "https:" && allowedHost && (url.hostname === allowedHost || url.hostname.endsWith(`.${allowedHost}`))) {
      return url.toString();
    }
  } catch {
    /* not a valid absolute URL - fall through to the safe default below */
  }
  return fallback;
}
