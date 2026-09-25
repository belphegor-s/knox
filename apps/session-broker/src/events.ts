import { pool } from "./db.js";

// What happened to each "Open Knox" click, for the admin overview's launch funnel. Recording
// is best-effort on purpose: a tracking write failing must never turn into a user's session
// failing to start (or end).
export type SessionEventKind =
  | "requested" // POST /api/sessions from a signed-in user
  | "resumed" // they already had one running, and got it back
  | "limit_daily" // refused: today's time budget is used up
  | "limit_active" // refused: this browser already has a session running
  | "started" // a container became reachable (duration_ms = boot time)
  | "failed" // the container never became reachable (duration_ms = time until giving up)
  | "ended"; // detail = "expired" | "ended"

export function recordEvent(
  kind: SessionEventKind,
  fields: { userId?: string | null; userLogin?: string | null; sessionId?: string | null; detail?: string | null; durationMs?: number | null } = {},
): void {
  pool
    .query(`INSERT INTO session_events (kind, user_id, user_login, session_id, detail, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)`, [
      kind,
      fields.userId ?? null,
      fields.userLogin ?? null,
      fields.sessionId ?? null,
      fields.detail ? fields.detail.slice(0, 300) : null,
      fields.durationMs == null ? null : Math.round(fields.durationMs),
    ])
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to record session event ${kind}:`, err);
    });
}
