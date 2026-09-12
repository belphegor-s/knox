import { runInContainer } from "./docker-runner.js";
import { runOnFargate } from "./ecs-runner.js";
import type { RunOptions } from "./docker-runner.js";

/** "docker" (default): sibling containers on this host's own daemon - see docker-runner.ts.
 * Correct for a single self-hosted deployment where every user already trusts this host.
 * "ecs": an isolated Fargate task per execution - see ecs-runner.ts. Needed once this worker
 * is serving untrusted code from the public internet, where docker's shared-kernel isolation
 * isn't enough on its own. */
export function runExecution(options: RunOptions): Promise<number> {
  const backend = process.env.KNOX_EXECUTION_BACKEND ?? "docker";
  if (backend === "ecs") return runOnFargate(options);
  if (backend === "docker") return runInContainer(options);
  throw new Error(`Unknown KNOX_EXECUTION_BACKEND: "${backend}" (expected "docker" or "ecs")`);
}
