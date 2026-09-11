# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Knox: a local-first, browser-native IDE. See `SPEC.md` (kept locally, not tracked in git - see "Repository conventions" below) for the full product spec, and `README.md` for what's actually built versus roadmap. Don't assume a package exists because it's named in the spec or in a directory listing - check for a `package.json`, not just a directory. Package/app directories that contain only a `README.md` are unimplemented placeholders (see the README's Status/Roadmap sections).

## Commands

```bash
pnpm install                          # install everything (Node >=20, pnpm 10.11.0)
pnpm dev                              # apps/web dev server on :5173
pnpm build                            # typecheck + production build, all packages
pnpm test                             # unit tests, all packages
pnpm typecheck                        # tsc --noEmit, all packages
```

Per-package, from that package's directory (or `pnpm --filter @knox/<name> <script>` from root):

```bash
pnpm --filter @knox/filesystem test                          # one package's tests
pnpm --filter @knox/filesystem exec vitest run src/test/glob.test.ts   # a single test file
pnpm --filter @knox/web exec tsc --noEmit                     # one package's typecheck
```

Production container:

```bash
docker build -f infra/Dockerfile -t knox .
docker run -p 8080:8080 knox        # http://localhost:8080, health check at /health
```

There's no top-level `lint` enforced in CI yet; `pnpm lint` scripts exist per-package but aren't wired to real ESLint configs.

### Verifying UI changes

Don't declare a UI change done from typecheck/build alone. Two scripts drive the real app in headless Chromium and report actual results (require `npm install playwright && npx playwright install chromium` in a scratch directory, not added as a repo dependency):

- `scripts/perf-check.mjs` - cold-load paint timing, vertical-slice timing, keystroke latency, against a running container (`KNOX_URL=http://localhost:PORT node scripts/perf-check.mjs`)
- `scripts/offline-check.mjs` - loads online once, creates+saves a file, disconnects the network, reloads, confirms the workspace and file content survive

Both are reproductions of the claims in `docs/performance.md` and `docs/local-runtime.md` - re-run them rather than trusting stale numbers if you change anything on the hot path (editor mount, service worker, filesystem writes).

## Architecture

### The `VirtualFileSystem` boundary

Everything above the filesystem layer (explorer, editor, eventually Git/search) programs against one interface defined in `packages/shared/src/vfs.ts`. Three implementations live in `packages/filesystem`: `OpfsFileSystem` (primary), `IndexedDbFileSystem` (fallback), `FileSystemAccessBackend` (opt-in user-picked folders). The first two share nothing; `OpfsFileSystem` and `FileSystemAccessBackend` share all their tree-walking logic via `FileSystemHandleBackend` (`handle-fs.ts`) since both just root a `FileSystemDirectoryHandle` tree differently. `createFileSystem(workspaceId)` in `create.ts` is the only place that picks a backend - don't instantiate a backend class directly outside tests.

`watch()` on every backend only observes writes made through *that instance* - none of OPFS/IndexedDB/File System Access have native cross-tab change notification. This is a real platform limitation, documented in `docs/local-runtime.md`, not something to "fix" with a workaround.

### State is split, not global

Three independent Zustand stores in `apps/web/src/state/`: `workspace-store` (the live `VirtualFileSystem` + metadata), `editor-store` (tabs, dirty flags, cursor/selection per tab), `layout-store` (panel visibility/size). Persisted state lives separately again in `apps/web/src/services/workspace-persistence.ts` (IndexedDB: `workspaces`/`sessions`/`settings`/`directoryHandles` stores), deliberately isolated from file *contents* in `packages/filesystem` - a corrupted session must never be able to touch project files. Don't collapse these back into one store or one IndexedDB database.

### `@knox/editor` has two entry points on purpose

`packages/editor`'s `index.ts` exports only `languages.ts` and `large-file.ts` - no `monaco-editor` import, safe to import eagerly. The actual `KnoxEditor` component, Monaco workers, themes, and model registry live behind `packages/editor/src/monaco.ts`, exported as the `"./monaco"` subpath and reached **only** via `React.lazy(() => import("@knox/editor/monaco"))` in `apps/web/src/app/EditorArea/EditorArea.tsx`.

This split is load-bearing, not stylistic: if anything anywhere statically imports something that transitively pulls in `monaco-editor`, Rollup can no longer put that module in its own lazy chunk, and the ~3.5MB Monaco bundle ends up in the app's initial load. If you add a new file that needs a Monaco type or the `KnoxEditor` component, import it from `"@knox/editor/monaco"`, and check `pnpm --filter @knox/web build`'s chunk output afterward - the app-shell chunk (`index-*.js`) should stay in the low hundreds of KB gzipped, not jump to megabytes.

### Command registry

`apps/web/src/commands/registry.ts` is the single source of truth for "things the app can do." Features register commands via `useRegisterCommands`/`commandRegistry.registerAll` on mount rather than wiring a keyboard shortcut straight to a component method. The Command Palette (`⌘K`/`⌘⇧P`) and Quick Open (`⌘P`) both read from this registry through the shared `Palette` component (`apps/web/src/app/Palette/Palette.tsx`) - don't build a second, parallel command list for a new feature.

### Cross-origin isolation

`SharedArrayBuffer`/threaded WASM need `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`, set in two independent places that must be kept in sync: the dev-server plugin in `apps/web/vite.config.ts` and `infra/nginx.conf` for production. If you add a build step or deployment path, it needs these headers too.

## Repository conventions

- **No em dashes anywhere in the app** (code, comments, docs, commit messages, UI copy) - use a hyphen, comma, colon, or parentheses instead. `SPEC.md` is the one exception: it's the user's original input file, kept on disk for reference but intentionally `.gitignore`d and untouched.
- **Commit progressively, not in one giant commit.** Split by logical unit (a package, a layer within a package, infra, docs) in roughly the dependency/build order things were added, with a commit message that explains *why*, not just what changed.
- **Never add an AI co-author trailer or session link to commits in this repo.** Commits are authored solely as the human user - no `Co-Authored-By` line, no Claude session reference.
- Every backend error maps onto `FileSystemError` with a stable `code` (see `packages/shared/src/vfs.ts`) - don't let a raw `DOMException` or IndexedDB error escape a filesystem backend.
- Empty package/app directories under `packages/` and `apps/` that contain only a `README.md` are intentional roadmap placeholders (SPEC.md's structure), not accidents - don't delete them, and don't build inside one without updating its README and the root README's Status section.
