import { pool } from "./db.js";

// The account/API half of the admin overview (knox.procd.cc/admin/). VS Code session numbers
// live in session-broker's own database and come from its own endpoint - the page stitches the
// two together, so neither service ever reads the other's tables.
//
// Every window is computed in the database's clock (UTC): "today" is date_trunc('day', now()),
// "7d"/"30d" are rolling. The page labels them as UTC so nobody mistakes them for local days.

export interface ApiOverview {
  generatedAt: string;
  users: {
    total: number;
    new7d: number;
    new30d: number;
    signedIn7d: number;
    recentSignups: Array<{ login: string | null; name: string | null; avatarUrl: string | null; createdAt: string }>;
  };
  executions: {
    today: number;
    last7d: number;
    last30d: number;
    succeeded7d: number;
    completed7d: number;
    p50Ms7d: number | null;
    p95Ms7d: number | null;
    byLanguage7d: Array<{ language: string; runs: number; failed: number }>;
    bySource7d: { api: number; ide: number };
    daily30d: Array<{ day: string; api: number; ide: number; failed: number }>;
    topUsers7d: Array<{ login: string | null; avatarUrl: string | null; runs: number }>;
  };
  apiKeys: { active: number; createdLast7d: number };
}

const num = (value: unknown): number => Number(value ?? 0);

export async function getApiOverview(): Promise<ApiOverview> {
  const [users, recentSignups, exec, byLanguage, daily, topUsers, keys] = await Promise.all([
    pool.query<{ total: string; new7d: string; new30d: string; signed_in_7d: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new7d,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new30d,
              COUNT(*) FILTER (WHERE last_sign_in_at >= now() - interval '7 days') AS signed_in_7d
       FROM users`,
    ),
    pool.query<{ github_login: string | null; name: string | null; avatar_url: string | null; created_at: Date }>(
      `SELECT github_login, name, avatar_url, created_at FROM users ORDER BY created_at DESC LIMIT 8`,
    ),
    pool.query<{ today: string; last7d: string; last30d: string; succeeded: string; completed: string; p50: number | null; p95: number | null; api: string; ide: string }>(
      `SELECT COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS today,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last7d,
              COUNT(*) AS last30d,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND exit_code = 0) AS succeeded,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND exit_code IS NOT NULL) AS completed,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE created_at >= now() - interval '7 days') AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE created_at >= now() - interval '7 days') AS p95,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND source = 'api') AS api,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND source = 'ide') AS ide
       FROM executions WHERE created_at >= now() - interval '30 days'`,
    ),
    pool.query<{ language: string; runs: string; failed: string }>(
      `SELECT language, COUNT(*) AS runs, COUNT(*) FILTER (WHERE exit_code IS DISTINCT FROM 0) AS failed
       FROM executions WHERE created_at >= now() - interval '7 days'
       GROUP BY language ORDER BY runs DESC, language`,
    ),
    pool.query<{ day: string; api: string; ide: string; failed: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COUNT(e.id) FILTER (WHERE e.source = 'api') AS api,
              COUNT(e.id) FILTER (WHERE e.source = 'ide') AS ide,
              COUNT(e.id) FILTER (WHERE e.id IS NOT NULL AND e.exit_code IS DISTINCT FROM 0) AS failed
       FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d(day)
       LEFT JOIN executions e ON e.created_at >= d.day AND e.created_at < d.day + interval '1 day'
       GROUP BY d.day ORDER BY d.day`,
    ),
    pool.query<{ github_login: string | null; avatar_url: string | null; runs: string }>(
      `SELECT u.github_login, u.avatar_url, COUNT(*) AS runs
       FROM executions e JOIN users u ON u.id = e.user_id
       WHERE e.created_at >= now() - interval '7 days'
       GROUP BY u.id ORDER BY runs DESC LIMIT 6`,
    ),
    pool.query<{ active: string; created_7d: string }>(
      `SELECT COUNT(*) FILTER (WHERE revoked_at IS NULL) AS active,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS created_7d
       FROM api_keys`,
    ),
  ]);

  const u = users.rows[0]!;
  const e = exec.rows[0]!;
  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: num(u.total),
      new7d: num(u.new7d),
      new30d: num(u.new30d),
      signedIn7d: num(u.signed_in_7d),
      recentSignups: recentSignups.rows.map((r) => ({ login: r.github_login, name: r.name, avatarUrl: r.avatar_url, createdAt: r.created_at.toISOString() })),
    },
    executions: {
      today: num(e.today),
      last7d: num(e.last7d),
      last30d: num(e.last30d),
      succeeded7d: num(e.succeeded),
      completed7d: num(e.completed),
      p50Ms7d: e.p50 == null ? null : Math.round(e.p50),
      p95Ms7d: e.p95 == null ? null : Math.round(e.p95),
      byLanguage7d: byLanguage.rows.map((r) => ({ language: r.language, runs: num(r.runs), failed: num(r.failed) })),
      bySource7d: { api: num(e.api), ide: num(e.ide) },
      daily30d: daily.rows.map((r) => ({ day: r.day, api: num(r.api), ide: num(r.ide), failed: num(r.failed) })),
      topUsers7d: topUsers.rows.map((r) => ({ login: r.github_login, avatarUrl: r.avatar_url, runs: num(r.runs) })),
    },
    apiKeys: { active: num(keys.rows[0]!.active), createdLast7d: num(keys.rows[0]!.created_7d) },
  };
}
