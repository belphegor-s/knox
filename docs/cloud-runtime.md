# Cloud runtime

Cloud execution (Python/C/C++/Java/Go/Rust) and accounts (GitHub sign-in) are real and
implemented. Sync and collaboration below are still spec-only - see each section for what that
means concretely.

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

## Alternative backend: AWS Fargate (implemented, not yet exercised against real AWS)

`docker-runner.ts`'s sibling containers share this host's kernel - fine when this host's own
users are the only ones running code on it, weaker once `apps/worker` is serving untrusted code
from the public internet, where a container-level escape (even an unlikely one) could reach
every other container on that host. `apps/worker/src/ecs-runner.ts` is a second executor that
runs each request as its own Fargate task instead - a separate hardware-virtualized microVM per
execution - selected via `KNOX_EXECUTION_BACKEND=ecs` (`apps/worker/src/executor.ts` is the
dispatcher; default stays `docker`). Full provisioning steps, the exact IAM policy, and the
concrete trade-offs (no live output streaming, slower cold start, weaker network isolation than
`--network none`) are in `infra/aws/README.md` - read that before switching a deployment to it.

`ecs:RunTask` has no equivalent of `docker run -i`, so code can't be piped in the way the local
path does. `infra/runner/knox-run` has two fully separate branches (chosen by whether
`$CODE_S3_URI` is set) so the ECS path's needs - fetching code from S3, uploading stdout/stderr
back to S3 once the process exits - can never subtly change the already-verified local path.

## Sync (specified, not implemented)

Encrypted, resumable sync of workspace metadata and *selected* files - never a blind full-directory sync. Planned building blocks: ignore rules (reusing the glob matcher already in `packages/filesystem/src/glob.ts`), size limits, binary detection (the same NUL-byte heuristic `useFileBuffer.ts` already uses locally), chunked/resumable uploads. Sync state per file: `✓ Saved locally / ↑ Syncing / ✓ Synced / ⚠ Offline / ⚠ Conflict` - never hidden, never silently retried into invisibility.

## Collaboration (specified, not implemented)

CRDT-based, per SPEC section 16. Local editing stays authoritative when no collaborators are connected - a user who never collaborates pays zero overhead, which is why this isn't wired into the editor's hot path today even as a no-op.

## Accounts (implemented): GitHub sign-in

GitHub OAuth is the only sign-in method. `apps/api` owns accounts; everything else asks it.

- **Flow.** `GET /auth/github?redirect=<url>` sets a short-lived `__Host-knox_oauth_state`
  cookie (the `__Host-` prefix means no sibling `*.procd.cc` origin, including a user's own VS
  Code session subdomain, can plant it) and redirects to GitHub. `GET /auth/github/callback`
  checks the state, exchanges the code, reads `/user` and `/user/emails`, discards the GitHub
  token, and sets `knox_session` (HttpOnly, Secure, SameSite=Lax, `Domain=KNOX_COOKIE_DOMAIN`).
  Scopes are `read:user user:email` - never repository access.
- **Identity.** Users are keyed on GitHub's numeric id. An account created before GitHub
  sign-in existed (the old email magic links, now removed) is linked on first sign-in when
  GitHub reports the same address as verified, so API keys and usage carry over.
- **Redirects** after sign-in or sign-out only go to `https://` URLs on the cookie domain.
- **What's gated:**
  - VS Code sessions: `POST /api/sessions` on `apps/session-broker` needs a sign-in, and a
    user with a session already running gets that session back instead of a second one.
  - Every request to a running session (`<sessionId>.procd.cc`: HTTP, websockets, End
    session) goes through `apps/session-broker/src/proxy.ts`, which only forwards it when the
    sign-in belongs to the account that started the session. Signed-out page loads are sent to
    GitHub sign-in and back; another account gets a 403. `knox_session` is stripped before the
    request reaches code-server. The broker caches positive `/auth/whoami` answers for 60s
    (code-server makes hundreds of requests per page load), so a sign-out takes up to a minute
    to reach an already-open session tab.
  - `/api/execute` (the in-browser IDE's `run`) needs a sign-in whenever `DATABASE_URL` is set.
    Without a database there are no accounts, and it stays open behind its rate limit.
  - `/app/` (the in-browser IDE) is gated by nginx `auth_request` when `KNOX_REQUIRE_AUTH=true`.
  - `/account` and API-key management need a sign-in; `/v1/execute` needs an API key.
  - The landing page stays public.
- **Self-hosting** needs none of this: `KNOX_REQUIRE_AUTH` defaults to `false`, and the base
  compose file runs without a database.

### Environment

| Service | Variable | Production value |
| --- | --- | --- |
| `api` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From the GitHub OAuth app |
| `api` | `KNOX_API_PUBLIC_URL` | `https://knox-api.procd.cc` (the callback is `<this>/auth/github/callback`) |
| `api` | `KNOX_COOKIE_DOMAIN` | `.procd.cc` |
| `session-broker` | `KNOX_ACCOUNT_API_URL` | `https://knox-api.procd.cc` (server-to-server `/auth/whoami`) |
| `session-broker` | `KNOX_ACCOUNT_PUBLIC_URL` | `https://knox-api.procd.cc` (where browsers go to sign in) |
| `web` | `KNOX_REQUIRE_AUTH` | `true` |
| `web` | `KNOX_SIGN_IN_URL` | `https://knox-api.procd.cc/auth/github` |

The GitHub OAuth app (github.com/settings/developers, "OAuth Apps", not a GitHub App) needs the
homepage URL `https://knox.procd.cc` and the callback URL
`https://knox-api.procd.cc/auth/github/callback`, exactly.

## Why this is a separate document

Mixing "how the local app works" with "how the cloud layer works" in one file makes it easy to blur which parts are real. Keeping them apart is a small, deliberate honesty mechanism - and now that execution is real, this doc says so plainly rather than hedging.
