# AWS Fargate execution backend

An alternative to `docker-runner.ts`'s sibling-container model (`apps/worker/src/ecs-runner.ts`)
for when `apps/worker` is serving untrusted code from the public internet rather than just this
host's own users. Sibling containers share this host's kernel; each Fargate task gets its own
hardware-virtualized microVM. Selected at runtime via `KNOX_EXECUTION_BACKEND=ecs` (default
remains `docker`) - see `apps/worker/src/executor.ts`.

**Not wired up in CI or docker-compose** - this is infra you provision by hand once, outside
this repo's own deploy path, the same way the base `web` service doesn't require api/worker/
runner to exist. Nothing here is required for local dev or the existing self-hosted Docker
execution path.

## What you're trading away vs. the local Docker path

Read this before deciding to switch a deployment over:

- **No live output streaming.** `ecs:RunTask` has no equivalent of `docker run -i` - a Fargate
  task can't receive piped stdin, and nothing polls its stdout/stderr live. Code goes in via S3,
  output comes back via S3, only once the task has fully finished (see
  `infra/runner/knox-run`'s ECS branch). A long-running program shows nothing until it exits,
  not a live trickle.
- **Cold start.** Fargate task provisioning + image pull commonly takes 10-30 seconds before the
  container's own 10-second in-script timeout even starts. `ecs-runner.ts`'s backstop is 90s to
  cover this - a `run` command that took ~200ms locally can now take several seconds to tens of
  seconds.
- **Network isolation is weaker.** `docker-runner.ts` uses `--network none` - the sandboxed
  container has provably zero network access. Fargate's `awsvpc` mode always attaches a network
  interface to the task; there is no Fargate equivalent of `--network none`. The security group
  below denies all inbound and restricts outbound to HTTPS only, which is a real narrowing but
  not the same absolute guarantee. If you need closer to that guarantee, put the task in a
  private subnet with VPC endpoints for ECR (`com.amazonaws.REGION.ecr.api`,
  `.ecr.dkr`), S3 (gateway endpoint, no hourly cost), and CloudWatch Logs, and drop the public
  IP / internet route entirely - this trades roughly $0.01/hr per interface endpoint (~$7/mo
  each) for meaningfully tighter isolation. This doc's default setup skips that for cost, given
  "no idle host, pay only per execution" was the point of moving to Fargate at all.
- **`readonlyRootFilesystem` isn't set.** The local path's `--read-only` root relies on `--tmpfs`
  mounts for `/workspace` and `/tmp`, and ECS's `tmpfs` container-definition field is EC2-only -
  Fargate doesn't support it. A writable root filesystem for the one-shot container is an
  accepted trade here, not an oversight: the whole microVM is destroyed after this single
  execution regardless, so there's nothing for a write to persist into.
- **No `no-new-privileges` or `--pids-limit` equivalent.** ECS's `linuxParameters` doesn't
  expose either as a task-definition field, for any launch type - only
  `capabilities.drop: ["ALL"]` (set below) carries over from the local Docker flags. A
  container escape gaining a fork bomb's worth of PIDs is bounded only by the task's own
  memory/CPU limits, not a hard PID ceiling.

## One-time setup

Replace `ACCOUNT_ID` and `REGION` below with your actual values throughout this directory.

```bash
# 1. One ECR repo + one image per language - NOT infra/runner.Dockerfile (that single ~1.9GB
#    image bundling all six toolchains is still what the local docker-runner.ts path uses, but
#    for ECS it means every cold Fargate task pulls Go/Rust/Java toolchains a Python run will
#    never touch. Verified against a real task: image pull alone was ~29s of a 73s total run
#    for a trivial `print(1+1)`. infra/runner-<lang>.Dockerfile only installs what that
#    language actually needs - "c" and "cpp" share one image since gcc/g++ both come from the
#    same build-essential package.
aws ecr get-login-password --region REGION | docker login --username AWS \
  --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
for lang in python c java go rust; do
  aws ecr create-repository --repository-name "knox-runner-$lang" --region REGION
  docker buildx build --platform linux/amd64 -f "infra/runner-$lang.Dockerfile" \
    -t "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/knox-runner-$lang:latest" --push infra/
done

# 2. S3 bucket for code-in / output-out staging - name MUST start with knox-execution- to
#    match iam-policy.json and task-role-policy.json's resource patterns
aws s3api create-bucket --bucket knox-execution-ACCOUNT_ID --region REGION
# Optional but recommended: expire the exec/ prefix after 1 day as a backstop against a
# crashed worker leaking objects (ecs-runner.ts already deletes them on the happy path).
aws s3api put-bucket-lifecycle-configuration --bucket knox-execution-ACCOUNT_ID \
  --lifecycle-configuration '{"Rules":[{"ID":"expire-exec","Filter":{"Prefix":"exec/"},"Status":"Enabled","Expiration":{"Days":1}}]}'

# 3. ECS cluster (Fargate needs no capacity provider setup beyond this)
aws ecs create-cluster --cluster-name knox-execution --region REGION

# 4. The two roles the TASK itself assumes (distinct from the IAM user/role that calls
#    RunTask - see iam-policy.json for that one)
aws iam create-role --role-name knox-ecs-execution-role \
  --assume-role-policy-document file://infra/aws/ecs-trust-policy.json
aws iam attach-role-policy --role-name knox-ecs-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name knox-ecs-task-role \
  --assume-role-policy-document file://infra/aws/ecs-trust-policy.json
aws iam put-role-policy --role-name knox-ecs-task-role --policy-name knox-task-s3 \
  --policy-document file://infra/aws/task-role-policy.json

# 5. Register the five task definitions (fill in ACCOUNT_ID/REGION in each
#    task-definition-runner-<lang>.json first)
for lang in python c java go rust; do
  aws ecs register-task-definition --cli-input-json "file://infra/aws/task-definition-runner-$lang.json"
done

# 6. Networking: a public subnet (existing default VPC is fine) + a security group with
#    NO inbound rules and outbound limited to HTTPS - the task pulls its image from ECR and
#    talks to S3/CloudWatch over HTTPS, and has no other reason to reach the network at all.
aws ec2 create-security-group --group-name knox-execution --description "Knox Fargate execution tasks" --vpc-id VPC_ID
aws ec2 authorize-security-group-egress --group-id SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0

# 7. Attach iam-policy.json to whatever IAM user/role apps/worker actually runs as in
#    production (its own role if running on ECS/EC2 itself, or an IAM user if running
#    elsewhere) - this is the identity ecs-runner.ts's AWS SDK calls authenticate as. If that
#    identity already has an inline policy from an earlier setup, REPLACE it in place (same
#    --policy-name) with this updated version rather than adding a second one under a new name -
#    IAM's default quota for the combined size of ALL of one user's inline policies is a mere
#    2048 bytes, easy to blow past with two separate ones, and there is no way to walk that back
#    short of raising the account's service quota (an inline policy, once put, cannot be
#    "shrunk" by anyone without iam:DeleteUserPolicy - check who actually holds that before
#    experimenting here).
aws iam put-role-policy --role-name <the role apps/worker runs as> \
  --policy-name knox-execution --policy-document file://infra/aws/iam-policy.json
```

## Environment variables `apps/worker` reads for this backend

See `.env.example` for the full list with descriptions. In short: `KNOX_EXECUTION_BACKEND=ecs`,
`AWS_REGION`, `KNOX_ECS_CLUSTER=knox-execution`, `KNOX_ECS_TASK_DEFINITION_PREFIX=knox-runner`,
`KNOX_ECS_CONTAINER_NAME_PREFIX=knox-runner` (ecs-runner.ts appends `-python`/`-c`/`-java`/`-go`/
`-rust` per request, matching the five task definitions registered above - "c" is used for both
the "c" and "cpp" languages), `KNOX_ECS_SUBNETS` (comma-separated subnet ids),
`KNOX_ECS_SECURITY_GROUPS` (comma-separated sg ids), `KNOX_CODE_BUCKET=knox-execution-ACCOUNT_ID`.
AWS credentials themselves come from the standard SDK credential chain (env vars, an attached IAM
role if `apps/worker` itself runs on AWS, etc) - `ecs-runner.ts` never reads
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` directly.

## Verifying it

None of this has been exercised against a real AWS account - it's implemented against the
documented ECS/S3 APIs and the same sandboxing intent as the already-verified local path, but
needs the same real-environment verification `docs/cloud-runtime.md` describes for
`docker-runner.ts` before being trusted: run all six languages, confirm a compile error surfaces
cleanly, confirm the security group actually blocks a network attempt from inside the container,
and time a cold-start request end to end.
