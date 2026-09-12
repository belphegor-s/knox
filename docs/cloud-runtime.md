# Cloud runtime

Cloud execution (Python/C/C++/Java/Go/Rust) is real and implemented. Sync, collaboration, and
auth below are still spec-only - see each section for what that means concretely.

## Cloud execution (implemented)

```
Browser terminal (packages/terminal)
 ↓ fetch("/api/execute")            packages/runtime/src/remote-executor.ts
 ↓
apps/api        (thin, public-facing: request validation, per-IP rate limiting, no Docker access)
 ↓ forwards to apps/worker's internal /execute
apps/worker     (the only service with Docker socket access)
 ↓ `docker run` with the flags in apps/worker/src/docker-runner.ts
Sandboxed container (infra/runner.Dockerfile: gcc/g++, default-jdk, python3, go, rustc)
 ↓ NDJSON stream of {type: "stdout"|"stderr", data} then {type: "exit", code}
```

This is the fallback path used only when `RuntimeCapabilities.localExecution` is `false` for a
language (Python/C/C++/Java/Go/Rust today - see `packages/runtime/src/capabilities.ts`). JS/TS
always run locally (`packages/runtime`'s `runScript`) and never touch this path.

**Deliberately additive, not required.** The base deployment (`docker compose up web`, or just
the static `infra/Dockerfile` build) never starts api/worker/runner and works exactly as before.
`infra/nginx.conf`'s `/api/` route uses a Docker-DNS-resolved variable specifically so a missing
`api` upstream 502s cleanly instead of crashing nginx at startup. `runRemote()` treats that (or
any non-JSON response, or a network error) as "unavailable" and the terminal falls back to the
same honest `unavailableReason` message it always showed - it never silently hangs or shows a
confusing raw network error.

**Sandboxing** (verified against a real Docker daemon, not just written down - see
`apps/worker/src/docker-runner.ts`): `--network none` (no network access at all),
`--memory 256m --memory-swap 256m` (hard cap, OOM-killed on exceeding it, no swap escape
hatch), `--cpus 1`, `--pids-limit 128`, `--read-only` root filesystem with `/workspace` and
`/tmp` as the only writable mounts (size-capped tmpfs), `--cap-drop ALL`,
`--security-opt no-new-privileges`, non-root `--user 1000:1000`, `--rm` (never persists), and a
10-second in-container `timeout` around the actual run step plus a 30-second host-side backstop
in case that fails for any reason. Every one of these was exercised for real (network blocked,
filesystem read-only, memory limit OOM-killing an intentional allocation, the timeout firing at
exactly 10s) before being called done.

**Deploying it**: `docker compose -f infra/docker-compose.yml --profile cloud-execution up` from
a host with a Docker daemon reachable at `/var/run/docker.sock` - apps/worker talks to that
daemon directly (Docker-outside-of-Docker: it spawns sibling containers on the host, never
nested inside itself) rather than running its own nested daemon. `apps/api` is the only piece
with a public route and has no Docker access at all, by design - narrowing what a compromised
public-facing process could reach.

**What's not here**: a job queue (requests are handled synchronously, one `docker run` per
request - fine for the current per-IP rate limit, not designed for high concurrency), a shared
rate-limit store (the limiter in `apps/api/src/rate-limit.ts` is in-process, correct for one
replica), and stdin support (a running program can't be sent interactive input).

## Sync (specified, not implemented)

Encrypted, resumable sync of workspace metadata and *selected* files - never a blind full-directory sync. Planned building blocks: ignore rules (reusing the glob matcher already in `packages/filesystem/src/glob.ts`), size limits, binary detection (the same NUL-byte heuristic `useFileBuffer.ts` already uses locally), chunked/resumable uploads. Sync state per file: `✓ Saved locally / ↑ Syncing / ✓ Synced / ⚠ Offline / ⚠ Conflict` - never hidden, never silently retried into invisibility.

## Collaboration (specified, not implemented)

CRDT-based, per SPEC section 16. Local editing stays authoritative when no collaborators are connected - a user who never collaborates pays zero overhead, which is why this isn't wired into the editor's hot path today even as a no-op.

## Auth (specified, not implemented)

Anonymous/local-only usage must never require an account (SPEC section 44) - this is already true today, trivially, since there's no auth system to bypass. Once built: OAuth/OIDC + GitHub login, short-lived sessions with refresh rotation, no secrets in `localStorage`.

## Why this is a separate document

Mixing "how the local app works" with "how the cloud layer works" in one file makes it easy to blur which parts are real. Keeping them apart is a small, deliberate honesty mechanism - and now that execution is real, this doc says so plainly rather than hedging.
