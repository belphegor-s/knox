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
    password TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS sessions_identity_idx ON sessions (ip, fingerprint_id, started_at);
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

export { pool };
