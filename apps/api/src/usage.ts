import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

// Count-based, not duration-based: with a 2-minute-per-run cap already bounding the worst case,
// "how many runs" is the more legible abuse signal, and the one a user can reason about (this
// is documented in /account so it isn't just a mystery 429). Overridable per deployment since
// there's no one-size-fits-right number here - defaults are a reasonable free-tier starting
// point, not a load-tested figure.
const DAILY_EXECUTION_CAP = Number(process.env.KNOX_DAILY_EXECUTION_CAP ?? 50);
const MONTHLY_EXECUTION_CAP = Number(process.env.KNOX_MONTHLY_EXECUTION_CAP ?? 500);

export class UsageLimitError extends Error {}

async function countSince(userId: string, since: "day" | "month"): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    // Only API-key runs count toward the API caps - IDE runs have their own per-minute limit.
    `SELECT COUNT(*) AS count FROM executions
     WHERE user_id = $1 AND source = 'api' AND created_at >= date_trunc($2, now())`,
    [userId, since],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function assertWithinUsageCaps(userId: string): Promise<void> {
  const [dailyCount, monthlyCount] = await Promise.all([countSince(userId, "day"), countSince(userId, "month")]);
  if (dailyCount >= DAILY_EXECUTION_CAP) {
    throw new UsageLimitError(`Daily execution limit reached (${DAILY_EXECUTION_CAP} runs/day). Try again tomorrow.`);
  }
  if (monthlyCount >= MONTHLY_EXECUTION_CAP) {
    throw new UsageLimitError(`Monthly execution limit reached (${MONTHLY_EXECUTION_CAP} runs/month). Try again next month.`);
  }
}

export type ExecutionSource = "api" | "ide";

export async function logExecution(entry: {
  userId: string;
  apiKeyId: string | null;
  source: ExecutionSource;
  language: string;
  exitCode: number | null;
  durationMs: number;
}): Promise<void> {
  await pool.query(
    "INSERT INTO executions (id, api_key_id, user_id, source, language, exit_code, duration_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [randomUUID(), entry.apiKeyId, entry.userId, entry.source, entry.language, entry.exitCode, Math.round(entry.durationMs)],
  );
}

export interface UsageSummary {
  today: number;
  thisMonth: number;
  dailyCap: number;
  monthlyCap: number;
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const [today, thisMonth] = await Promise.all([countSince(userId, "day"), countSince(userId, "month")]);
  return { today, thisMonth, dailyCap: DAILY_EXECUTION_CAP, monthlyCap: MONTHLY_EXECUTION_CAP };
}
