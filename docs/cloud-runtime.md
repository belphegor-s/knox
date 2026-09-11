# Cloud runtime (not implemented)

Everything in this document describes the architecture `SPEC.md` specifies for optional cloud features. **None of it exists in the current codebase.** It's written down now so the interfaces the local-first core exposes (`RuntimeCapabilities`, the command registry, `VirtualFileSystem`) are designed with these seams in mind from day one, per the spec's own instruction to "keep the architecture replaceable" (section 113) - not because any of this is running.

If you're looking for what *is* implemented, see `docs/local-runtime.md` and the README's Status section.

## Intended shape

```
IDE
 ↓
Execution API        (apps/api - stateless)
 ↓
Job Queue
 ↓
Ephemeral Worker      (apps/worker)
 ↓
Container             (Docker, CPU/memory/process/timeout/fs-quota/network-limited)
 ↓
Result Stream         (back to the IDE, backpressured)
```

Cloud execution is the fallback path, chosen only when:

1. A language's `RuntimeCapabilities.localExecution` is `false` (e.g., Rust/Go/C++ until a WASM toolchain exists for them locally), or
2. The user explicitly opts into cloud execution for a language that *could* run locally.

The UI must show which mode is active - never silently redirect local work to the cloud.

## Job lifecycle (specified, not implemented)

```
queued → starting → running → completed | failed | cancelled | expired
```

With heartbeats: a worker that stops heartbeating expires its job's lease, which then retries under a bounded retry count. Non-idempotent operations (anything that writes to a real external system, once those exist) need an explicit idempotency key before this is safe - not yet designed.

## Sync (specified, not implemented)

Encrypted, resumable sync of workspace metadata and *selected* files - never a blind full-directory sync. Planned building blocks: ignore rules (reusing the glob matcher already in `packages/filesystem/src/glob.ts`), size limits, binary detection (the same NUL-byte heuristic `useFileBuffer.ts` already uses locally), chunked/resumable uploads. Sync state per file: `✓ Saved locally / ↑ Syncing / ✓ Synced / ⚠ Offline / ⚠ Conflict` - never hidden, never silently retried into invisibility.

## Collaboration (specified, not implemented)

CRDT-based, per SPEC section 16. Local editing stays authoritative when no collaborators are connected - a user who never collaborates pays zero overhead, which is why this isn't wired into the editor's hot path today even as a no-op.

## Auth (specified, not implemented)

Anonymous/local-only usage must never require an account (SPEC section 44) - this is already true today, trivially, since there's no auth system to bypass. Once built: OAuth/OIDC + GitHub login, short-lived sessions with refresh rotation, no secrets in `localStorage`.

## Why this is a separate document

Mixing "how the local app works" with "how a not-yet-built cloud layer will work" in one file makes it easy to accidentally imply the cloud half is further along than it is. Keeping them apart is a small, deliberate honesty mechanism.
