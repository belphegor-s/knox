# api

Thin, stateless, public-facing HTTP layer. Currently exposes one route: `POST /api/execute`,
which validates the request, applies a per-IP rate limit, and forwards to `apps/worker`'s
internal `/execute`, streaming the NDJSON response straight back.

Deliberately has no Docker access - `apps/worker` is the only service that talks to the Docker
daemon, so a bug or compromise in this public-facing process can't reach it. See
`docs/cloud-runtime.md` for the full request path and sandboxing details, and
`infra/docker-compose.yml`'s `cloud-execution` profile to run it.

Auth, sync, collaboration-session, and AI-proxy routes described in SPEC section 43 aren't
built yet - see the root README's Roadmap section.
