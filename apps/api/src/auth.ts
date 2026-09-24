import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { pool } from "./db.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const SESSION_COOKIE_NAME = "knox_session";

// __Host- prefix on purpose, unlike the session cookie: it forbids a Domain attribute, so no
// sibling *.procd.cc origin can plant or overwrite it. That matters here specifically because
// every VS Code session lives on its own procd.cc subdomain running user-controlled code
// (code-server's /proxy/<port>/ serves whatever the user runs) - a planted state cookie is the
// classic way to force a victim through an attacker's OAuth code (login CSRF).
export const OAUTH_STATE_COOKIE_NAME = "__Host-knox_oauth_state";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export interface Account {
  userId: string;
  email: string;
  githubLogin: string | null;
  name: string | null;
  avatarUrl: string | null;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isGithubConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

// ---- GitHub OAuth ----------------------------------------------------------------------------

/** The state value lives in the cookie AND the authorize URL; the callback only proceeds when
 * GitHub hands back the same value the browser's own cookie holds. The post-sign-in redirect
 * rides along in the cookie rather than in GitHub's state param, so it never leaves our domain. */
export function beginGithubSignIn(callbackUrl: string, redirect: string): { authorizeUrl: string; stateCookie: string } {
  const state = randomToken();
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID ?? "",
    redirect_uri: callbackUrl,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  const value = `${state}.${Buffer.from(redirect, "utf8").toString("base64url")}`;
  return {
    authorizeUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
    stateCookie: `${OAUTH_STATE_COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
  };
}

export function clearOauthStateCookieHeader(): string {
  return `${OAUTH_STATE_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Returns the redirect stored at sign-in start, or null when the state doesn't match (a
 * missing/expired cookie, or a callback this browser never started). */
export function checkOauthState(cookieValue: string | undefined, returnedState: string | undefined): { redirect: string } | null {
  if (!cookieValue || !returnedState) return null;
  const dot = cookieValue.indexOf(".");
  if (dot === -1) return null;
  const expected = Buffer.from(cookieValue.slice(0, dot), "utf8");
  const actual = Buffer.from(returnedState, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { redirect: Buffer.from(cookieValue.slice(dot + 1), "base64url").toString("utf8") };
}

export class GithubAuthError extends Error {}

interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  verifiedEmail: string | null;
}

async function githubJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "knox-api",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new GithubAuthError(`GitHub API ${new URL(url).pathname} returned ${res.status}`);
  return (await res.json()) as T;
}

/** Exchanges the one-time code for a token, reads the profile, and discards the token - Knox
 * never calls GitHub on the user's behalf after sign-in, so there's no reason to keep it. */
export async function fetchGithubProfile(code: string, callbackUrl: string): Promise<GithubProfile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "knox-api" },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new GithubAuthError(`GitHub token exchange failed: ${tokenBody.error_description ?? tokenBody.error ?? tokenRes.status}`);
  }
  const token = tokenBody.access_token;

  const user = await githubJson<{ id: number; login: string; name: string | null; avatar_url: string | null }>("https://api.github.com/user", token);
  // /user's own `email` field is only the PUBLIC profile email and says nothing about whether
  // it's verified - /user/emails (the user:email scope) is the only place verification shows.
  const emails = await githubJson<Array<{ email: string; primary: boolean; verified: boolean }>>("https://api.github.com/user/emails", token).catch(
    () => [],
  );
  const verified = emails.filter((e) => e.verified);
  const verifiedEmail = (verified.find((e) => e.primary) ?? verified[0])?.email ?? null;

  return { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url, verifiedEmail };
}

/** Keyed on GitHub's numeric id (stable across username changes), never on login or email.
 * An account created before GitHub sign-in existed (email-only) is linked on first GitHub
 * sign-in when GitHub vouches for that same address as verified, so its API keys and usage
 * history carry over instead of being stranded under an account nobody can sign into anymore. */
export async function upsertGithubUser(profile: GithubProfile): Promise<string> {
  const byGithub = await pool.query<{ id: string }>(
    `UPDATE users SET github_login = $2, name = $3, avatar_url = $4 WHERE github_id = $1 RETURNING id`,
    [profile.id, profile.login, profile.name, profile.avatarUrl],
  );
  if (byGithub.rows[0]) return byGithub.rows[0].id;

  const normalizedEmail = profile.verifiedEmail?.trim().toLowerCase() ?? null;
  if (normalizedEmail) {
    const linked = await pool.query<{ id: string }>(
      `UPDATE users SET github_id = $1, github_login = $2, name = $3, avatar_url = $4
       WHERE email = $5 AND github_id IS NULL RETURNING id`,
      [profile.id, profile.login, profile.name, profile.avatarUrl, normalizedEmail],
    );
    if (linked.rows[0]) return linked.rows[0].id;
  }

  // No verified email, or that address already belongs to a different GitHub account: fall
  // back to GitHub's own noreply form, which is unique per GitHub id by construction.
  const fallbackEmail = `${profile.id}+${profile.login.toLowerCase()}@users.noreply.github.com`;
  const id = randomUUID();
  for (const email of normalizedEmail ? [normalizedEmail, fallbackEmail] : [fallbackEmail]) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, github_id, github_login, name, avatar_url) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING RETURNING id`,
      [id, email, profile.id, profile.login, profile.name, profile.avatarUrl],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;
  }
  // Lost a race with a concurrent first sign-in for this same GitHub account.
  const raced = await pool.query<{ id: string }>("SELECT id FROM users WHERE github_id = $1", [profile.id]);
  if (raced.rows[0]) return raced.rows[0].id;
  throw new GithubAuthError("Could not create an account for this GitHub user.");
}

// ---- sessions --------------------------------------------------------------------------------

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<Account | null> {
  if (!token) return null;
  const { rows } = await pool.query<{ user_id: string; email: string; github_login: string | null; name: string | null; avatar_url: string | null }>(
    `SELECT s.user_id, u.email, u.github_login, u.name, u.avatar_url FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id, email: row.email, githubLogin: row.github_login, name: row.name, avatarUrl: row.avatar_url } : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function pruneExpiredAuthState(): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key || key in out) continue; // first wins: the most specific Path/Domain comes first
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

// Unset by default (host-only cookie, safe for local dev) - set to ".procd.cc" in production so
// the SAME session is readable across knox.procd.cc, knox-api.procd.cc, and every
// <sessionId>.procd.cc VS Code subdomain, letting one sign-in gate the code-execution API, the
// in-browser IDE, and VS Code sessions (session-broker validates it via GET /auth/whoami,
// forwarding the cookie it receives).
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

/** True for an https origin on the cookie domain (or the cookie domain itself) - the only
 * origins allowed to read /auth/me with credentials or be redirected to after sign-in. */
export function isTrustedOrigin(value: string): boolean {
  const allowedHost = COOKIE_DOMAIN ? COOKIE_DOMAIN.replace(/^\./, "") : null;
  if (!allowedHost) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === allowedHost || url.hostname.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

// Only ever redirect somewhere on procd.cc after sign-in - a caller-supplied redirect target is
// otherwise a straightforward open redirect (anyone could send a victim through a real GitHub
// sign-in that lands them on an attacker's page afterwards, looking fully legitimate).
export function sanitizeRedirectTarget(value: string | undefined, fallback: string): string {
  if (value && isTrustedOrigin(value)) return new URL(value).toString();
  return fallback;
}
