import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "./db.js";

const KEY_PREFIX = "knox_live_";

function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** Returns the full key exactly once - only its hash and a short display prefix are ever
 * persisted, matching how session tokens are stored. */
export async function createApiKey(userId: string, name: string): Promise<{ id: string; key: string }> {
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const id = randomUUID();
  const keyPrefix = key.slice(0, KEY_PREFIX.length + 6);
  await pool.query("INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4, $5)", [
    id,
    userId,
    hashKey(key),
    keyPrefix,
    name,
  ]);
  return { id, key };
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
  }>("SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  }));
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const { rowCount } = await pool.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL", [
    keyId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}

export interface ResolvedApiKey {
  id: string;
  userId: string;
}

/** Called on every /v1/execute request - looks up by hash (never by prefix alone, which isn't
 * unique enough to authenticate with) and rejects revoked keys explicitly rather than just
 * finding no row, so a revoked key's failure reads as "revoked" in logs, not "not found". */
export async function resolveApiKey(rawKey: string | undefined): Promise<ResolvedApiKey | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const { rows } = await pool.query<{ id: string; user_id: string; revoked_at: Date | null }>(
    "SELECT id, user_id, revoked_at FROM api_keys WHERE key_hash = $1",
    [hashKey(rawKey)],
  );
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  pool.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [row.id]).catch(() => {});
  return { id: row.id, userId: row.user_id };
}
