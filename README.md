# Knox

A local-first, browser-native development environment.

Knox is a real, working IDE that runs almost entirely in your browser tab. There is no backend to reach before you can write code: opening the app gives you a real filesystem (OPFS, with an IndexedDB fallback), a real Monaco-based editor, and real persistence - all before any network request completes. Cloud features (sync, collaboration, hosted execution) are additive, not load-bearing; AI is BYO-provider and optional.

This README describes what's actually implemented, what's scaffolded-but-honest-about-its-limits, and what's still roadmap. See `SPEC.md` for the full product specification this was built against.

---

## Status

**Implemented and verified** (built, typechecked, tested, and driven end-to-end in a real browser - see `docs/performance.md` for how):

- Local filesystem abstraction (`packages/filesystem`) - OPFS primary, IndexedDB fallback, File System Access API for user-picked folders - unified behind one `VirtualFileSystem` interface
- Workspace + session persistence (open tabs, cursor positions, layout, settings) with debounced autosave and automatic restore on reload
- Monaco-based editor (`packages/editor`) with real TypeScript/JavaScript/JSON/HTML/CSS language intelligence, syntax highlighting for a dozen+ other languages, large-file degradation, binary/image file handling
- Virtualized file explorer (create/rename/delete/move), tabs (preview + pinned), command palette, quick open, keyboard-first navigation
- Git (`packages/git`) - isomorphic-git in a worker: init/clone/status/add/commit/branch/checkout/log/diff/fetch/pull/push/merge, a real Source Control panel with inline diff
- Terminal (`packages/terminal`) - xterm.js over a worker-hosted shell, real readline-style line editing (cursor movement, word-jump/word-delete, kill-to-start/end, history, Tab completion for commands and paths - see `packages/terminal/src/view.tsx`), plus `run <file>`
- Local JS/TS execution (`packages/runtime`) - runs in a disposable worker per call, TypeScript transpiled via the real TS compiler, output streamed, hard timeout
- Cloud execution for Python/C/C++/Java/Go/Rust (`apps/api` + `apps/worker`) - `run <file>` in the terminal forwards to a real, sandboxed Docker container (network-isolated, read-only root fs, memory/CPU/pid-capped, non-root, timeout-enforced) when one of those languages' local runtime is unavailable; optional and additive - see `docs/cloud-runtime.md`. `run`'s language dispatch is by file extension, not a hardcoded JS/TS assumption
- Workspace search (`packages/search`) - runs in a worker, cancels stale requests, jump-to-line from results
- AI chat (`packages/ai`) - real streaming chat (fetch + SSE) against OpenAI-compatible or Anthropic endpoints, BYO key stored only in this browser, a visible "AI Context" inspector, pattern-based secret redaction before anything reaches a provider
- Service-worker precaching for instant, offline-capable repeat loads
- Docker/Coolify-ready deployment (static build behind nginx, with the correct cross-origin-isolation headers); optional cloud-execution containers behind a compose profile

**Scaffolded architecture, not yet wired to real behavior:**

- AI agent loop, patch propose/apply, the AI permission model, model routing, Git/terminal-specific AI actions (commit messages, explain diff/failure) - the chat itself is real; these are the larger features built on top of it
- Preview panel for web projects
- LSP architecture for languages beyond TS/JS (syntax highlighting works; no diagnostics/go-to-def for Python/Rust/Go/C/C++ etc.)
- Sync, collaboration, auth - described in `docs/cloud-runtime.md`, not implemented (cloud execution, in the same document, now is)
- WASM runtimes for Python/Rust/Go/C/C++ locally in the browser - these run via the cloud execution path above instead; no bundled WASM toolchain exists for them (see `packages/runtime/src/capabilities.ts`)

Nothing above fakes functionality it doesn't have - every "not yet" surface says so explicitly instead of pretending. See the Roadmap section below.

---

## Why local-first

> The browser should do as much work as possible locally using WebAssembly, Web Workers, OPFS/IndexedDB and browser-native capabilities. Cloud execution/synchronization is optional and should be used only when local capabilities are insufficient.

Concretely, this means:

- **No account to start coding.** Welcome → New Project → editing, in one flow.
- **Your code doesn't leave your device** unless you explicitly connect a cloud feature (an AI provider, sync, a collaboration session).
- **The app works offline** once loaded, including on reload - files, Git history, terminal, search, and settings all live in the browser.
- **The backend, when you run one, is stateless.** It never becomes the source of truth for your files.

## Architecture

```
/apps
  /web         React + Vite app shell - the IDE itself
  /api         stateless, public-facing HTTP layer - implemented for cloud execution (POST /api/execute); auth/sync/AI-proxy routes still planned
  /worker      Docker-socket-privileged cloud execution worker - implemented; runs submitted code in a sandboxed container per request

/packages
  /shared      cross-cutting types, events, VFS interface, worker RPC, utilities
  /filesystem  OPFS / IndexedDB / File System Access implementations
  /editor      Monaco integration (kept in a separate lazy-loaded chunk)
  /runtime     local JS/TS execution in a disposable worker
  /terminal    xterm.js + a worker-hosted shell
  /git         isomorphic-git over the VirtualFileSystem, in a worker
  /search      worker-hosted text search with stale-request cancellation
  /ai          provider abstraction (OpenAI-compatible + Anthropic), context engine, secret redaction
  /language-server  (planned) LSP-compatible worker architecture beyond TS/JS
  /collaboration    (planned) CRDT-based presence/editing
  /sync        (planned) encrypted, resumable cloud sync
  /ui          (planned) shared design-system components
  /security    (planned) AI permission model (secret detection already lives in packages/ai)
  /protocol    (planned) typed worker/RPC message contracts beyond @knox/shared's generic one

/infra         Dockerfile, nginx.conf, docker-compose.yml
/docs          architecture, performance, security, local-runtime, cloud-runtime
```

Every package other than `shared` sits behind a narrow interface (`VirtualFileSystem`, `RuntimeCapabilities`, `AiProvider`, the command registry) so a backend can be swapped - or a feature added - without touching the app shell. See `docs/architecture.md`.

### Why this stack

- **Vite, not Next.js** - Knox is a single-page app with no server-rendering need; Vite's dev server and code-splitting are a better fit and keep the "no backend to start coding" promise honest.
- **Monaco** - the only browser editor with a genuinely real TypeScript language service, not a reimplementation. Its ~5MB footprint is kept out of the initial bundle via a dedicated lazy-loaded subpath (`@knox/editor/monaco`) - see `docs/performance.md`. Terminal (xterm.js) and Git's isomorphic-git follow the same lazy-chunk/worker pattern.
- **Zustand over Redux/Context** - cheap, un-opinionated stores that map directly onto the state boundaries the spec calls for (workspace, editor, layout, git, search, ai - each independent, see section 56).
- **No component library** - Tailwind/shadcn defaults would fight the "not a SaaS landing page" visual brief; hand-written CSS with design tokens gives full control over density and restraint.
- **pnpm workspaces, no Turborepo** - the dependency graph is currently shallow enough that a task runner would be overhead, not leverage. Revisit once `/packages` grows past ~10 buildable units.

## Local development

```bash
pnpm install
pnpm dev            # apps/web on http://localhost:5173
```

```bash
pnpm build           # typecheck + production build, all packages
pnpm test            # unit tests, all packages
pnpm typecheck        # tsc --noEmit, all packages
```

Requires Node ≥20 and pnpm (the repo pins `pnpm@10.11.0` via `packageManager`).

### Production-like local deployment

```bash
docker compose -f infra/docker-compose.yml up --build
# → http://localhost:8080  (health check at /health)
```

## Deployment (Coolify or any Docker host)

1. Point Coolify at this repository, build context `infra/Dockerfile`.
2. No environment variables are required for the base deployment - copy `.env.example` only if you're enabling optional server-side features later.
3. Coolify (or your reverse proxy) must forward `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` unchanged - `infra/nginx.conf` sets them, but a proxy in front can still strip them. See `docs/architecture.md#cross-origin-isolation`.
4. Health check: `GET /health` → `200 ok`.

## Security model

Repository contents are treated as untrusted input, not trusted configuration - this applies to Git repos you clone, package scripts, and file contents sent to an AI provider (wrapped in `<untrusted-repository-content>` tags with an explicit system-prompt instruction not to follow directives inside it). See `docs/security.md` for the full model, including what secret-redaction and prompt-injection defense is actually wired in today versus what's still specified-only (the AI permission model, an agent loop with tool calls).

## Performance

Numbers are measured, not asserted - `docs/performance.md` documents the methodology (a scripted Playwright run against both the dev server and the production container) and the actual results from the last run, including bundle sizes and the vertical-slice timing.

## Roadmap

In spec build order (see `SPEC.md` section 110), what's next:

1. LSP architecture for languages beyond TS/JS
2. Preview panel for web projects
3. AI agent loop (understand → plan → inspect → modify → test), patch propose/apply with per-file accept/reject, the explicit AI permission model from SPEC section 22
4. Git/terminal-specific AI actions built on the existing chat: commit message generation from a real diff, explain diff, explain a failed command
5. Sync, collaboration, auth (`apps/api`, `apps/worker`) - cloud execution, the first piece of this milestone, is already implemented (see `docs/cloud-runtime.md`)

## License

MIT
