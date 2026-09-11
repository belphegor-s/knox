# Security

## Threat model

Project contents are untrusted input - SPEC section 37/95 are explicit that this includes cloned Git repositories, package scripts, filenames, and (once the AI package exists) file contents fed to a model. Nothing in this repo grants elevated trust to a file just because it's inside the open workspace.

## What's actually enforced today

Knox currently has **no code execution** (no `packages/runtime`, no terminal shell) - so the sandboxing, capability-boundary, and "never grant powerful browser APIs implicitly" requirements in SPEC sections 10/11 have nothing to bound yet. This section documents the parts that *are* live, and is explicit about what isn't.

### Filesystem

- Every path is validated through `isValidFileName` (`packages/shared/src/path.ts`) before create/rename - rejects empty names, `.`/`..`, control characters, and OS-reserved trailing space/dot, so a malicious or malformed name from an imported project can't produce a path that behaves differently across filesystem backends.
- `FileSystemAccessBackend` (user-picked local folders) never receives implicit permission - `pickDirectory()` requires a user gesture, and `ensurePermission()` explicitly re-checks/re-requests `readwrite` access on every session restore rather than assuming a prior grant still holds.
- Binary/image content is sniffed (`useFileBuffer.ts`, a NUL-byte heuristic on the first 8KB) before ever reaching the editor, so a binary file can't be accidentally decoded and displayed as garbled text - SPEC section 5's "handle binary files".

### Storage isolation

- Session/workspace metadata (`services/workspace-persistence.ts`) and file contents (`packages/filesystem`) live in separate IndexedDB databases/stores by design - a corrupted or malicious write to one can't cross into the other (SPEC section 78).

### Network

The app currently makes **zero** runtime network requests beyond the initial asset load and the service worker's precache fetch - there is no telemetry, no analytics, no third-party call of any kind. This isn't a policy switch that could be flipped on by mistake; there is simply no code path that sends anything anywhere yet.

## What's specified but not built

These are real architectural requirements from `SPEC.md` that the current codebase does not implement. Listed here so nobody mistakes their absence for "handled":

- **Execution sandboxing** (section 11): `RuntimeCapabilities`/`ExecutionSandboxPolicy` types already exist in `packages/shared/src/capabilities.ts` with the intended defaults (`filesystem: "workspace-only"`, `network: false`, clipboard/camera/microphone/location all denied) - but nothing consumes them yet, because there's no runtime to bound.
- **Secret detection** (section 38): no `.env`/credential scanning exists yet. Once `packages/ai` exists, this must run *before* any file content leaves the browser for a model, defaulting to redaction.
- **AI prompt-injection defense** (section 96): repository content must be tagged as untrusted data in the model context, distinct from system/user/tool messages, once the AI package exists. Not applicable today - there's no AI integration to inject into.
- **AI patch safety / transactional apply** (section 97): specified, not built.
- **Cloud execution isolation** (section 12/37): containers with CPU/memory/process/timeout/filesystem-quota/network-policy limits - not built; there's no cloud execution yet.
- **Authentication** (section 44/84): not built - the app is local-only today, and per section 44, local-only users must never be forced to authenticate once cloud features exist either.

## Reporting

This is a local build, not a hosted service - there's no bug bounty program. If you find a vulnerability while self-hosting, treat it like any other issue in your own deployment: patch and redeploy. If you're contributing upstream, flag security-relevant changes explicitly in the PR description.
