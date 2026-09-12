import { randomUUID } from "node:crypto";
import { ECSClient, RunTaskCommand, DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { RunOptions } from "./docker-runner.js";

// Fargate cold start (task provisioning + image pull) commonly takes 10-30s before the
// container's own 10s in-script timeout even starts running - this backstop has to be well
// clear of that, unlike the local Docker path's 30s (which only waits on an already-running
// host's docker daemon, no provisioning).
const TASK_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;

const REGION = process.env.AWS_REGION;
const CLUSTER = process.env.KNOX_ECS_CLUSTER;
const TASK_DEFINITION = process.env.KNOX_ECS_TASK_DEFINITION;
const CONTAINER_NAME = process.env.KNOX_ECS_CONTAINER_NAME ?? "knox-runner";
const SUBNETS = (process.env.KNOX_ECS_SUBNETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SECURITY_GROUPS = (process.env.KNOX_ECS_SECURITY_GROUPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ASSIGN_PUBLIC_IP = process.env.KNOX_ECS_ASSIGN_PUBLIC_IP !== "false";
const CODE_BUCKET = process.env.KNOX_CODE_BUCKET;

let ecsClient: ECSClient | null = null;
let s3Client: S3Client | null = null;

function ecs(): ECSClient {
  ecsClient ??= new ECSClient({ region: REGION });
  return ecsClient;
}
function s3(): S3Client {
  s3Client ??= new S3Client({ region: REGION });
  return s3Client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(body: unknown): Promise<string> {
  // AWS SDK v3's GetObject Body is a Node Readable in this runtime (not a browser ReadableStream).
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** Runs untrusted, user-submitted source as an isolated Fargate task instead of a sibling
 * container on this host - see docs/cloud-runtime.md for why: unlike docker-runner.ts's
 * sibling containers (shared kernel with this host), each Fargate task gets its own
 * hardware-virtualized microVM, which matters once this is serving untrusted code from the
 * public internet rather than just this host's own users.
 *
 * Fargate has no equivalent of `docker run -i` - RunTask can't receive piped stdin, and
 * nothing polls a task's stdout/stderr live - so code goes in and output comes back via S3
 * (see infra/runner/knox-run's ECS branch), and results only become available once the task
 * has fully finished. Callers see one batched onOutput per stream, not a live stream. */
export async function runOnFargate({ language, filename, code, onOutput }: RunOptions): Promise<number> {
  if (!CLUSTER || !TASK_DEFINITION || !CODE_BUCKET || SUBNETS.length === 0) {
    throw new Error(
      "ECS execution backend is misconfigured: KNOX_ECS_CLUSTER, KNOX_ECS_TASK_DEFINITION, KNOX_CODE_BUCKET, and KNOX_ECS_SUBNETS are all required.",
    );
  }

  const id = randomUUID();
  const srcKey = `exec/${id}/src/${filename}`;
  const outputPrefix = `exec/${id}/out/`;

  await s3().send(new PutObjectCommand({ Bucket: CODE_BUCKET, Key: srcKey, Body: code }));

  let taskArn: string | undefined;
  try {
    const runResult = await ecs().send(
      new RunTaskCommand({
        cluster: CLUSTER,
        taskDefinition: TASK_DEFINITION,
        launchType: "FARGATE",
        count: 1,
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: SUBNETS,
            securityGroups: SECURITY_GROUPS.length > 0 ? SECURITY_GROUPS : undefined,
            assignPublicIp: ASSIGN_PUBLIC_IP ? "ENABLED" : "DISABLED",
          },
        },
        overrides: {
          containerOverrides: [
            {
              name: CONTAINER_NAME,
              command: [language, filename],
              environment: [
                { name: "CODE_S3_URI", value: `s3://${CODE_BUCKET}/${srcKey}` },
                { name: "OUTPUT_S3_PREFIX", value: `s3://${CODE_BUCKET}/${outputPrefix}` },
              ],
            },
          ],
        },
      }),
    );

    if (runResult.failures && runResult.failures.length > 0) {
      throw new Error(`ECS RunTask failed: ${runResult.failures.map((f) => f.reason).join("; ")}`);
    }
    taskArn = runResult.tasks?.[0]?.taskArn;
    if (!taskArn) throw new Error("ECS RunTask returned no task ARN");

    const exitCode = await pollUntilStopped(taskArn);
    const [stdout, stderr] = await Promise.all([
      readOutputObject(`${outputPrefix}stdout.log`),
      readOutputObject(`${outputPrefix}stderr.log`),
    ]);
    if (stdout) onOutput("stdout", stdout);
    if (stderr) onOutput("stderr", stderr);
    return exitCode;
  } finally {
    await cleanup(srcKey, outputPrefix, taskArn).catch(() => {});
  }
}

async function pollUntilStopped(taskArn: string): Promise<number> {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  for (;;) {
    const { tasks } = await ecs().send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] }));
    const task = tasks?.[0];
    if (task?.lastStatus === "STOPPED") {
      const container = task.containers?.[0];
      if (container?.exitCode != null) return container.exitCode;
      // The task stopped before the container ever produced an exit code - a provisioning
      // failure (bad image, no capacity, task role can't assume) rather than the program
      // itself exiting, so surface ECS's own reason instead of a bare "1".
      throw new Error(`Task stopped without an exit code: ${task.stoppedReason ?? "unknown reason"}`);
    }
    if (Date.now() > deadline) {
      await ecs()
        .send(new StopTaskCommand({ cluster: CLUSTER, task: taskArn, reason: "Knox: server-side execution timeout" }))
        .catch(() => {});
      throw new Error("Execution timed out (server-side limit).");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function readOutputObject(key: string): Promise<string> {
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: CODE_BUCKET, Key: key }));
    return await readBody(result.Body);
  } catch {
    // Missing output object (e.g. the task never got far enough to upload it) isn't itself an
    // error worth failing the request over - pollUntilStopped already surfaces the real reason.
    return "";
  }
}

async function cleanup(srcKey: string, outputPrefix: string, taskArn: string | undefined): Promise<void> {
  const keys = [srcKey, `${outputPrefix}stdout.log`, `${outputPrefix}stderr.log`];
  await Promise.all(keys.map((Key) => s3().send(new DeleteObjectCommand({ Bucket: CODE_BUCKET, Key })).catch(() => {})));
  if (taskArn) {
    // Best-effort: if the task somehow is still running (our own timeout path already stops
    // it), make sure nothing is left billing after this function returns either way.
    const { tasks } = await ecs()
      .send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] }))
      .catch(() => ({ tasks: undefined }));
    if (tasks?.[0]?.lastStatus && tasks[0].lastStatus !== "STOPPED") {
      await ecs()
        .send(new StopTaskCommand({ cluster: CLUSTER, task: taskArn, reason: "Knox: cleanup" }))
        .catch(() => {});
    }
  }
}
