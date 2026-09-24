import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// IDs are generated application-side (randomUUID), matching apps/session-broker's own
// convention - no pgcrypto extension dependency on the database image.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- GitHub is the only sign-in method. ALTERs rather than a fresh CREATE so already-deployed
  -- databases pick these up; email stays NOT NULL (a verified GitHub address, or GitHub's own
  -- noreply form when the account exposes none) so accounts created by the old email sign-in
  -- can be linked by address on their first GitHub sign-in - see auth.ts's upsertGithubUser.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id BIGINT UNIQUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS github_login TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  -- Magic-link sign-in was removed; its one-time tokens have nothing left to redeem them.
  DROP TABLE IF EXISTS magic_links;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    exit_code INTEGER,
    duration_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS executions_key_time_idx ON executions (api_key_id, created_at);
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

export { pool };
