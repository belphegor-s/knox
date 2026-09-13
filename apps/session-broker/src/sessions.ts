import { randomUUID } from "node:crypto";
import { RunTaskCommand, DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { DescribeNetworkInterfacesCommand } from "@aws-sdk/client-ec2";
import { ecs, ec2 } from "./ecs.js";
import { pool } from "./db.js";

// Two independent caps, both enforced here: 15 minutes per session (SESSION_DURATION_MS) and
// 30 cumulative minutes per (ip, fingerprint) per calendar day (DAILY_CAP_MS) - a session is
// actually granted the SHORTER of "15 minutes" and "whatever's left of today's 30-minute
// budget", not a flat 15 minutes regardless of prior usage today.
const SESSION_DURATION_MS = 15 * 60 * 1000;
const DAILY_CAP_MS = 30 * 60 * 1000;
// Fargate cold start (task provisioning + image pull) - this image is much larger than the
// batch execution runner's, so this needs more headroom than ecs-runner.ts's 90s.
const TASK_START_TIMEOUT_MS = 150_000;
const POLL_INTERVAL_MS = 2_000;

const CLUSTER = process.env.KNOX_ECS_CLUSTER;
const TASK_DEFINITION = process.env.KNOX_VSCODE_TASK_DEFINITION;
const CONTAINER_NAME = process.env.KNOX_VSCODE_CONTAINER_NAME ?? "knox-vscode";
const SUBNETS = (process.env.KNOX_ECS_SUBNETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SECURITY_GROUPS = (process.env.KNOX_VSCODE_SECURITY_GROUPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export class SessionLimitError extends Error {}

export interface SessionRecord {
  id: string;
  publicIp: string;
  expiresAt: Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getDailyUsageMs(ip: string, fingerprintId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    `SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(stopped_at, expires_at) - started_at)) * 1000) AS total
     FROM sessions
     WHERE ip = $1 AND fingerprint_id = $2 AND started_at >= date_trunc('day', now())`,
    [ip, fingerprintId],
  );
  return Number(rows[0]?.total ?? 0);
}

async function hasActiveSession(ip: string, fingerprintId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM sessions WHERE ip = $1 AND fingerprint_id = $2 AND stopped_at IS NULL AND expires_at > now() LIMIT 1`,
    [ip, fingerprintId],
  );
  return rows.length > 0;
}

/** Fargate tasks don't expose their public IP directly on the RunTask/DescribeTasks response -
 * it lives on the ENI that gets attached once the task reaches RUNNING, and has to be looked up
 * separately via EC2's DescribeNetworkInterfaces. Polls until both are true. */
async function waitForPublicIp(taskArn: string): Promise<string> {
  const deadline = Date.now() + TASK_START_TIMEOUT_MS;
  for (;;) {
    const { tasks } = await ecs.send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] }));
    const task = tasks?.[0];
    if (task?.lastStatus === "STOPPED") {
      throw new Error(`Session task stopped before becoming reachable: ${task.stoppedReason ?? "unknown reason"}`);
    }
    const eniId = task?.attachments?.[0]?.details?.find((d) => d.name === "networkInterfaceId")?.value;
    if (task?.lastStatus === "RUNNING" && eniId) {
      const { NetworkInterfaces } = await ec2.send(new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eniId] }));
      const publicIp = NetworkInterfaces?.[0]?.Association?.PublicIp;
      if (publicIp) return publicIp;
    }
    if (Date.now() > deadline) throw new Error("Timed out waiting for the session to become reachable");
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function createSession(ip: string, fingerprintId: string, userId: string): Promise<SessionRecord> {
  if (!CLUSTER || !TASK_DEFINITION || SUBNETS.length === 0) {
    throw new Error("Session broker is misconfigured: KNOX_ECS_CLUSTER, KNOX_VSCODE_TASK_DEFINITION, and KNOX_ECS_SUBNETS are all required.");
  }

  const usedMs = await getDailyUsageMs(ip, fingerprintId);
  if (usedMs >= DAILY_CAP_MS) {
    throw new SessionLimitError("Daily coding time limit reached (30 minutes). Try again tomorrow, or self-host Knox for unrestricted use.");
  }
  if (await hasActiveSession(ip, fingerprintId)) {
    throw new SessionLimitError("A session is already running for this browser.");
  }

  const id = randomUUID();

  // No PASSWORD override here on purpose: code-server's --auth password mode needs the
  // password submitted through its own login form (a cookie, set server-side), not a URL
  // query string - there is no code-server-supported way to hand a generated password to a
  // browser and land it already logged in. Access control for a session instead comes from
  // the network: the security group on this task allows inbound 8080 from ONLY the broker's
  // own host, so a browser can never reach code-server directly no matter what it knows -
  // every request is forced through this proxy, gated on knowing this session's unguessable
  // (UUIDv4) id. vscode-entrypoint.sh falls back to --auth none whenever PASSWORD is unset,
  // which is exactly what self-hosted sessions already run with.
  const run = await ecs.send(
    new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK_DEFINITION,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: { subnets: SUBNETS, securityGroups: SECURITY_GROUPS.length > 0 ? SECURITY_GROUPS : undefined, assignPublicIp: "ENABLED" },
      },
    }),
  );

  if (run.failures && run.failures.length > 0) {
    throw new Error(`ECS RunTask failed: ${run.failures.map((f) => f.reason).join("; ")}`);
  }
  const taskArn = run.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("ECS RunTask returned no task ARN");

  const publicIp = await waitForPublicIp(taskArn);
  const remainingTodayMs = DAILY_CAP_MS - usedMs;
  const expiresAt = new Date(Date.now() + Math.min(SESSION_DURATION_MS, remainingTodayMs));

  await pool.query(
    `INSERT INTO sessions (id, ip, fingerprint_id, user_id, task_arn, public_ip, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, ip, fingerprintId, userId, taskArn, publicIp, expiresAt],
  );

  return { id, publicIp, expiresAt };
}

export async function lookupActiveSession(id: string): Promise<{ publicIp: string; expiresAt: Date } | null> {
  const { rows } = await pool.query<{ public_ip: string; expires_at: Date }>(
    `SELECT public_ip, expires_at FROM sessions WHERE id = $1 AND stopped_at IS NULL AND expires_at > now()`,
    [id],
  );
  return rows[0] ? { publicIp: rows[0].public_ip, expiresAt: rows[0].expires_at } : null;
}

/** Actually enforces the 15-minute cap - nothing inside the container can be trusted to
 * self-terminate on time, so this has to reach in and stop it from the outside. Call on an
 * interval (see server.ts), not just once. */
export async function reapExpiredSessions(): Promise<void> {
  const { rows } = await pool.query<{ id: string; task_arn: string }>(
    `SELECT id, task_arn FROM sessions WHERE stopped_at IS NULL AND expires_at <= now()`,
  );
  for (const row of rows) {
    await ecs
      .send(new StopTaskCommand({ cluster: CLUSTER, task: row.task_arn, reason: "Knox: session time limit reached" }))
      .catch(() => {});
    await pool.query(`UPDATE sessions SET stopped_at = now() WHERE id = $1`, [row.id]);
  }
}
