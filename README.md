# Knox

A local-first, browser-native development environment.

Knox is a real, working IDE that runs almost entirely in your browser tab. There is no backend to reach before you can write code: opening the app gives you a real filesystem (OPFS, with an IndexedDB fallback), a real Monaco-based editor, and real persistence - all before any network request completes. Cloud features (sync, collaboration, hosted execution, AI) are additive, not load-bearing.

This README describes what's actually implemented, what's scaffolded-but-honest-about-its-limits, and what's still roadmap. See `SPEC.md` for the full product specification this was built against.

---

## Status

**Implemented and verified** (built, typechecked, tested, and driven end-to-end in a real browser - see `docs/performance.md` for how):

- Local filesystem abstraction (`packages/filesystem`) - OPFS primary, IndexedDB fallback, File System Access API for user-picked folders - unified behind one `VirtualFileSystem` interface
- Workspace + session persistence (open tabs, cursor positions, layout, settings) with debounced autosave and automatic restore on reload
- Monaco-based editor (`packages/editor`) with real TypeScript/JavaScript/JSON/HTML/CSS language intelligence, syntax highlighting for a dozen+ other languages, large-file degradation, binary/image file handling
- Virtualized file explorer (create/rename/delete/move), tabs (preview + pinned), command palette, quick open, keyboard-first navigation
- Service-worker precaching for instant, offline-capable repeat loads
- Docker/Coolify-ready deployment (static build behind nginx, with the correct cross-origin-isolation headers)

**Scaffolded architecture, not yet wired to real behavior:**

- Terminal panel - UI slot exists (`⌘\``), no shell/WASM runtime behind it yet
- Git panel - UI slot exists, no `isomorphic-git` integration yet
- AI panel - UI slot exists with an honest "not configured" empty state, no provider integration yet
- Cloud execution, sync, collaboration, auth - described in the architecture docs, not implemented

Nothing above fakes functionality it doesn't have - every "not yet" panel says so explicitly instead of pretending. See the Roadmap section below.

---

## Why local-first

> The browser should do as much work as possible locally using WebAssembly, Web Workers, OPFS/IndexedDB and browser-native capabilities. Cloud execution/synchronization is optional and should be used only when local capabilities are insufficient.

Concretely, this means:

- **No account to start coding.** Welcome → New Project → editing, in one flow.
- **Your code doesn't leave your device** unless you explicitly connect a cloud feature (an AI provider, sync, a collaboration session).
- **The app works offline** once loaded, including on reload - files, Git history (once wired), and settings all live in the browser.
- **The backend, when you run one, is stateless.** It never becomes the source of truth for your files.

## Architecture

```
/apps
  /web         React + Vite app shell - the IDE itself
  /api         (planned) stateless API: auth, sync, cloud execution, AI proxy
  /worker      (planned) cloud execution worker

/packages
  /shared      cross-cutting types, events, VFS interface, utilities
  /filesystem  OPFS / IndexedDB / File System Access implementations
  /editor      Monaco integration (kept in a separate lazy-loaded chunk)
  /runtime     (planned) WASM execution abstraction
  /terminal    (planned) xterm.js + local/cloud PTY
  /git         (planned) isomorphic-git integration
  /language-server  (planned) LSP-compatible worker architecture
  /collaboration    (planned) CRDT-based presence/editing
  /ai          (planned) provider abstraction, context engine, agent loop
  /sync        (planned) encrypted, resumable cloud sync
  /ui          (planned) shared design-system components
  /security    (planned) secret detection, permission model
  /protocol    (planned) typed worker/RPC message contracts

/infra         Dockerfile, nginx.conf, docker-compose.yml
/docs          architecture, performance, security, local-runtime, cloud-runtime
```

Every package other than `shared` sits behind a narrow interface (`VirtualFileSystem`, `RuntimeCapabilities`, the command registry) so a backend can be swapped - or a feature added - without touching the app shell. See `docs/architecture.md`.

### Why this stack

- **Vite, not Next.js** - Knox is a single-page app with no server-rendering need; Vite's dev server and code-splitting are a better fit and keep the "no backend to start coding" promise honest.
- **Monaco** - the only browser editor with a genuinely real TypeScript language service, not a reimplementation. Its ~5MB footprint is kept out of the initial bundle via a dedicated lazy-loaded subpath (`@knox/editor/monaco`) - see `docs/performance.md`.
- **Zustand over Redux/Context** - cheap, un-opinionated stores that map directly onto the state boundaries the spec calls for (workspace, editor, layout, filesystem - each independent, see section 56).
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

Repository contents are treated as untrusted input, not trusted configuration - this applies to Git repos you clone, package scripts, and (once the AI package lands) file contents sent to a model. See `docs/security.md` for the full model, including the secret-redaction and prompt-injection design that's now specified but not yet wired into a shipping AI feature.

## Performance

Numbers are measured, not asserted - `docs/performance.md` documents the methodology (a scripted Playwright run against both the dev server and the production container) and the actual results from the last run, including bundle sizes and the vertical-slice timing.

## Roadmap

In spec build order (see `SPEC.md` section 110), what's next:

1. Worker architecture + search indexing (`packages/search`, incremental, worker-hosted)
2. Git (`packages/git`, isomorphic-git over the `VirtualFileSystem`)
3. Terminal (`packages/terminal`, xterm.js + a WASM shell/runtime)
4. WASM language runtimes (JS/TS native, Python via Pyodide, capability-gated for the rest)
5. LSP architecture for languages beyond TS/JS
6. Preview panel for web projects
7. AI context engine + assistant + agent loop, with the permission model from `docs/security.md`
8. Cloud execution, sync, collaboration, auth (`apps/api`, `apps/worker`)

## License

MIT
