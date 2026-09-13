import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// IDs are generated application-side (randomUUID), not via a Postgres extension like
// pgcrypto's gen_random_uuid() - one less thing to depend on the database image providing.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    fingerprint_id TEXT NOT NULL,
    task_arn TEXT NOT NULL,
    public_ip TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS sessions_identity_idx ON sessions (ip, fingerprint_id, started_at);
  -- Dropped in favor of network-level access control (see sessions.ts's createSession) -
  -- ALTER rather than a fresh CREATE TABLE so already-deployed databases pick it up too.
  ALTER TABLE sessions DROP COLUMN IF EXISTS password;
  -- Recorded once sign-in became required (apps/session-broker/src/account-auth.ts) - kept
  -- alongside, not instead of, the existing (ip, fingerprint_id) cap: an account is the real
  -- gate now, but the fingerprint/IP check stays as a second layer against one account being
  -- used to spin up sessions from many different browsers at once.
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

export { pool };
