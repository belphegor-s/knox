import { pool } from "./db.js";
import { DAILY_CAP_MINUTES } from "./sessions.js";

// The VS Code half of the admin overview (knox.procd.cc/admin/); apps/api serves the account/API
// half. Minutes are real time spent: a running session counts up to now, not to its expiry.
// Windows are in the database's clock (UTC) - "today" from midnight UTC, "7d"/"30d" rolling.

export interface SessionsOverview {
  generatedAt: string;
  dailyCapMinutes: number;
  live: Array<{ id: string; login: string | null; startedAt: string; expiresAt: string; bootMs: number | null }>;
  totals: {
    sessionsToday: number;
    sessions7d: number;
    minutesToday: number;
    minutes7d: number;
    usersToday: number;
    users7d: number;
    avgSessionMinutes7d: number | null;
  };
  funnel7d: { requested: number; started: number; resumed: number; limitDaily: number; limitActive: number; failed: number };
  endReasons7d: { expired: number; ended: number };
  bootMs7d: { p50: number | null; p95: number | null };
  daily30d: Array<{ day: string; sessions: number; minutes: number; users: number }>;
  topUsers7d: Array<{ login: string | null; minutes: number; sessions: number }>;
  recent: Array<{ login: string | null; startedAt: string; minutes: number; bootMs: number | null; endReason: string | null; live: boolean }>;
  recentFailures: Array<{ login: string | null; at: string; detail: string | null }>;
}

const num = (value: unknown): number => Number(value ?? 0);
// Seconds a session has actually run, from any sessions row aliased `s`.
const RAN_SECONDS = `EXTRACT(EPOCH FROM (LEAST(COALESCE(s.stopped_at, s.expires_at), now()) - s.started_at))`;

export async function getSessionsOverview(): Promise<SessionsOverview> {
  const [live, totals, funnel, boot, daily, topUsers, recent, failures] = await Promise.all([
    pool.query<{ id: string; user_login: string | null; started_at: Date; expires_at: Date; boot_ms: number | null }>(
      `SELECT id, user_login, started_at, expires_at, boot_ms FROM sessions
       WHERE stopped_at IS NULL AND expires_at > now() ORDER BY started_at DESC`,
    ),
    pool.query<{ sessions_today: string; sessions_7d: string; seconds_today: string | null; seconds_7d: string | null; users_today: string; users_7d: string; avg_seconds_7d: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE s.started_at >= date_trunc('day', now())) AS sessions_today,
              COUNT(*) AS sessions_7d,
              SUM(${RAN_SECONDS}) FILTER (WHERE s.started_at >= date_trunc('day', now())) AS seconds_today,
              SUM(${RAN_SECONDS}) AS seconds_7d,
              COUNT(DISTINCT s.user_id) FILTER (WHERE s.started_at >= date_trunc('day', now())) AS users_today,
              COUNT(DISTINCT s.user_id) AS users_7d,
              AVG(${RAN_SECONDS}) FILTER (WHERE s.stopped_at IS NOT NULL) AS avg_seconds_7d
       FROM sessions s WHERE s.started_at >= now() - interval '7 days'`,
    ),
    pool.query<{ kind: string; detail: string | null; count: string }>(
      `SELECT kind, detail, COUNT(*) AS count FROM session_events
       WHERE created_at >= now() - interval '7 days' GROUP BY kind, detail`,
    ),
    pool.query<{ p50: number | null; p95: number | null }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY boot_ms) AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY boot_ms) AS p95
       FROM sessions WHERE started_at >= now() - interval '7 days' AND boot_ms IS NOT NULL`,
    ),
    pool.query<{ day: string; sessions: string; seconds: string | null; users: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COUNT(s.id) AS sessions,
              SUM(${RAN_SECONDS}) AS seconds,
              COUNT(DISTINCT s.user_id) AS users
       FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d(day)
       LEFT JOIN sessions s ON s.started_at >= d.day AND s.started_at < d.day + interval '1 day'
       GROUP BY d.day ORDER BY d.day`,
    ),
    pool.query<{ user_login: string | null; seconds: string; sessions: string }>(
      `SELECT MAX(s.user_login) AS user_login, SUM(${RAN_SECONDS}) AS seconds, COUNT(*) AS sessions
       FROM sessions s WHERE s.started_at >= now() - interval '7 days' AND s.user_id IS NOT NULL
       GROUP BY s.user_id ORDER BY seconds DESC LIMIT 6`,
    ),
    pool.query<{ user_login: string | null; started_at: Date; seconds: string; boot_ms: number | null; end_reason: string | null; live: boolean }>(
      `SELECT s.user_login, s.started_at, ${RAN_SECONDS} AS seconds, s.boot_ms, s.end_reason,
              (s.stopped_at IS NULL AND s.expires_at > now()) AS live
       FROM sessions s ORDER BY s.started_at DESC LIMIT 12`,
    ),
    pool.query<{ user_login: string | null; created_at: Date; detail: string | null }>(
      `SELECT user_login, created_at, detail FROM session_events WHERE kind = 'failed' ORDER BY created_at DESC LIMIT 5`,
    ),
  ]);

  const count = (kind: string, detail?: string) =>
    funnel.rows.filter((r) => r.kind === kind && (detail === undefined || r.detail === detail)).reduce((sum, r) => sum + num(r.count), 0);
  const t = totals.rows[0]!;
  const minutes = (seconds: string | null) => Math.round(num(seconds) / 60);

  return {
    generatedAt: new Date().toISOString(),
    dailyCapMinutes: DAILY_CAP_MINUTES,
    live: live.rows.map((r) => ({ id: r.id, login: r.user_login, startedAt: r.started_at.toISOString(), expiresAt: r.expires_at.toISOString(), bootMs: r.boot_ms })),
    totals: {
      sessionsToday: num(t.sessions_today),
      sessions7d: num(t.sessions_7d),
      minutesToday: minutes(t.seconds_today),
      minutes7d: minutes(t.seconds_7d),
      usersToday: num(t.users_today),
      users7d: num(t.users_7d),
      avgSessionMinutes7d: t.avg_seconds_7d == null ? null : Math.round((num(t.avg_seconds_7d) / 60) * 10) / 10,
    },
    funnel7d: {
      requested: count("requested"),
      started: count("started"),
      resumed: count("resumed"),
      limitDaily: count("limit_daily"),
      limitActive: count("limit_active"),
      failed: count("failed"),
    },
    endReasons7d: { expired: count("ended", "expired"), ended: count("ended", "ended") },
    bootMs7d: { p50: boot.rows[0]?.p50 == null ? null : Math.round(boot.rows[0].p50), p95: boot.rows[0]?.p95 == null ? null : Math.round(boot.rows[0].p95) },
    daily30d: daily.rows.map((r) => ({ day: r.day, sessions: num(r.sessions), minutes: minutes(r.seconds), users: num(r.users) })),
    topUsers7d: topUsers.rows.map((r) => ({ login: r.user_login, minutes: minutes(r.seconds), sessions: num(r.sessions) })),
    recent: recent.rows.map((r) => ({
      login: r.user_login,
      startedAt: r.started_at.toISOString(),
      minutes: Math.round((num(r.seconds) / 60) * 10) / 10,
      bootMs: r.boot_ms,
      endReason: r.end_reason,
      live: r.live,
    })),
    recentFailures: failures.rows.map((r) => ({ login: r.user_login, at: r.created_at.toISOString(), detail: r.detail })),
  };
}
