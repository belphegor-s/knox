# worker

Runs untrusted, user-submitted source code (Python/C/C++/Java/Go/Rust) in a throwaway,
sandboxed Docker container per request, and streams stdout/stderr back as NDJSON. The one
service in this repo with Docker socket access - see `src/docker-runner.ts` for the exact
sandbox flags (network-isolated, read-only root filesystem, memory/CPU/pid-capped, non-root,
timeout-enforced) and `docs/cloud-runtime.md` for the full path and how it was verified.

Talks to the *host's* Docker daemon over a mounted socket (Docker-outside-of-Docker) rather
than running a nested daemon - every execution is a sibling container, never nested inside this
one. The image it runs (`knox-runner`, built from `infra/runner.Dockerfile`) has the actual
compilers/interpreters installed; this service just orchestrates it.

Not reachable from the browser directly - `apps/api` is the public front door.
