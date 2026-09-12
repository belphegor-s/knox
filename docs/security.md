# Security

## Threat model

Project contents are untrusted input - SPEC section 37/95 are explicit that this includes cloned Git repositories, package scripts, filenames, and file contents fed to an AI model. Nothing in this repo grants elevated trust to a file just because it's inside the open workspace.

## What's actually enforced today

### Filesystem

- Every path is validated through `isValidFileName` (`packages/shared/src/path.ts`) before create/rename - rejects empty names, `.`/`..`, control characters, and OS-reserved trailing space/dot, so a malicious or malformed name from an imported project can't produce a path that behaves differently across filesystem backends.
- `FileSystemAccessBackend` (user-picked local folders) never receives implicit permission - `pickDirectory()` requires a user gesture, and `ensurePermission()` explicitly re-checks/re-requests `readwrite` access on every session restore rather than assuming a prior grant still holds.
- Binary/image content is sniffed (`useFileBuffer.ts`, a NUL-byte heuristic on the first 8KB) before ever reaching the editor, so a binary file can't be accidentally decoded and displayed as garbled text - SPEC section 5's "handle binary files".

### Storage isolation

- Session/workspace metadata (`services/workspace-persistence.ts`) and file contents (`packages/filesystem`) live in separate IndexedDB databases/stores by design - a corrupted or malicious write to one can't cross into the other (SPEC section 78). AI provider config (including the API key) lives in its own IndexedDB database (`services/ai-settings.ts`) for the same reason.

### Code execution

- `packages/runtime` runs user JS/TS in a fresh, disposable worker per call - a worker already has no DOM/window access, which is most of the isolation boundary. The worker also deletes `fetch`/`XMLHttpRequest`/`WebSocket`/`importScripts` off its own global scope before running any code, a real (if not airtight - a sufficiently determined script could still find other channels) mitigation for the "network: disabled by default" capability in SPEC section 11.
- A caller-side timeout terminates the worker if a script hangs; a synchronous infinite loop can't be interrupted from inside the same thread.
- The `RuntimeCapabilities`/`ExecutionSandboxPolicy` types in `packages/shared/src/capabilities.ts` describe the fuller sandbox model (filesystem: workspace-only, clipboard/camera/microphone/location denied) - not all of it is consumed yet since only the JS/TS runtime exists.

### AI

- **Secret redaction** (`packages/ai/src/secrets.ts`): pattern-based detection for AWS access keys, GitHub tokens, OpenAI-style keys, JWTs, PEM private key headers, database connection strings, and generic `key = "..."`-shaped assignments, run on file content before it's added to a request's context. Default is redact, not warn-and-send.
- **Prompt-injection defense** (SPEC section 96): repository content included in a request is wrapped in `<untrusted-repository-content path="..." reason="...">` tags, with a system-prompt instruction that content in those tags is data, never instructions, regardless of what it claims. There's no agent/tool-calling loop yet, so the blast radius of ignoring this is currently "the model says something silly in chat" rather than "the model takes an unauthorized action" - but the discipline is in place before that changes.
- **Provider credentials never leave the browser except to that provider's own endpoint** - no proxy, no logging, stored in IndexedDB only (SPEC section 85).

### Network

Beyond the initial asset load, the service worker's precache fetch, and requests a user explicitly configures (an AI provider endpoint), the app makes no runtime network calls - no telemetry, no analytics, no third-party call of any kind.

## What's specified but not built

Real architectural requirements from `SPEC.md` the current codebase does not implement. Listed here so nobody mistakes their absence for "handled":

- **AI agent permissions** (section 22): the `AgentPermissions` type exists in `packages/shared/src/capabilities.ts` with sensible defaults (modify/run/delete all default to "ask", network defaults to "deny") - but there's no agent loop yet to gate, so nothing enforces it.
- **AI patch safety / transactional apply** (section 97): specified, not built - there's no patch-proposal flow yet, only chat.
- **Cloud execution isolation** (section 12/37): containers with CPU/memory/process/timeout/filesystem-quota/network-policy limits - not built; there's no cloud execution yet.
- **Authentication** (section 44/84): not built - the app is local-only today, and per section 44, local-only users must never be forced to authenticate once cloud features exist either.

## Reporting

This is a local build, not a hosted service - there's no bug bounty program. If you find a vulnerability while self-hosting, treat it like any other issue in your own deployment: patch and redeploy. If you're contributing upstream, flag security-relevant changes explicitly in the PR description.
