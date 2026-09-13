import { ECSClient } from "@aws-sdk/client-ecs";
import { EC2Client } from "@aws-sdk/client-ec2";

// Single shared clients, not one per call - matches apps/worker/src/ecs-runner.ts's own
// lazy-singleton pattern for the same reason (avoid re-establishing AWS SDK connection pools
// per request).
export const ecs = new ECSClient({ region: process.env.AWS_REGION });
export const ec2 = new EC2Client({ region: process.env.AWS_REGION });
