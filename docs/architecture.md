# Architecture

## Boundary: `VirtualFileSystem`

Everything above the filesystem layer - the explorer, the editor, (eventually) Git and search - programs against one interface, defined in `packages/shared/src/vfs.ts`:

```ts
interface VirtualFileSystem {
  readFile(path): Promise<Uint8Array>;
  writeFile(path, data, options?): Promise<FileStat>;
  mkdir(path, options?): Promise<void>;
  delete(path, options?): Promise<void>;
  rename(from, to): Promise<void>;
  copy(from, to): Promise<void>;
  move(from, to): Promise<void>;
  exists(path): Promise<boolean>;
  stat(path): Promise<FileStat>;
  readdir(path, options?): Promise<FileEntry[]>;
  watch(path, callback): Disposable;
  search(query, options?): AsyncIterable<SearchMatch>;
  usage(): Promise<{ bytesUsed, bytesAvailable }>;
}
```

Three implementations exist today (`packages/filesystem`):

| Backend | When used | Notes |
|---|---|---|
| `OpfsFileSystem` | OPFS supported (`navigator.storage.getDirectory`) | Primary path. Async API (`createWritable`), not sync access handles - works identically from the main thread and workers. |
| `IndexedDbFileSystem` | OPFS unavailable | Two object stores (`entries` metadata, `contents` bytes) - metadata is queried separately from content so directory listings never pull file bytes off disk. |
| `FileSystemAccessBackend` | User explicitly picks a folder | Wraps a real `FileSystemDirectoryHandle`; requires a user gesture to acquire and to re-grant permission after reload - a genuine browser constraint, not an oversight. Shares all its tree-walking logic with `OpfsFileSystem` via `FileSystemHandleBackend` (`handle-fs.ts`), since both are just different roots over the same File System Access primitives. |

Every backend maps its native errors onto one `FileSystemError` with a stable `code` (`NOT_FOUND`, `QUOTA_EXCEEDED`, `CONFLICT`, …), so error-handling UI doesn't need to know which backend is active.

`watch()` is honest about its limits: none of OPFS/IndexedDB/FSA expose native cross-tab change notification, so a `VirtualFileSystem` instance only observes writes made through *itself*. This is sufficient for everything in this repo (the explorer watches the same instance the editor writes through) but won't catch a second tab editing the same OPFS-backed workspace - documented in `docs/local-runtime.md`.

## Boundary: state

Per SPEC section 56, state is split into independent stores rather than one global object, so resizing a panel never rerenders the editor and vice versa:

- `state/workspace-store.ts` - the active `VirtualFileSystem` + workspace metadata (runtime, not persisted directly)
- `state/editor-store.ts` - open tabs, dirty flags, cursor/selection/scroll per tab
- `state/layout-store.ts` - panel visibility/size, distraction-free mode

Persisted state lives separately again, in `services/workspace-persistence.ts` (IndexedDB: `workspaces`, `sessions`, `settings`, `directoryHandles` object stores) - deliberately isolated from file *contents*, so a corrupted session can never take a project's files with it (SPEC section 78).

## The editor bundle split

Monaco is ~5MB minified. `packages/editor` has two entry points:

- `@knox/editor` - language metadata (`languages.ts`), large-file thresholds (`large-file.ts`). No Monaco import. Safe to import eagerly (used by the status bar, file-buffer classification).
- `@knox/editor/monaco` - the actual `KnoxEditor` component, Monaco workers, themes, model registry. **Only ever reached via `React.lazy(() => import("@knox/editor/monaco"))`** in `EditorArea.tsx`.

This isn't cosmetic: importing anything from a barrel that transitively pulls in `monaco-editor`, even statically from an unrelated file, defeats code-splitting - Rollup can't put a module in its own lazy chunk if something else imports it eagerly. The first version of this split didn't exist and shipped a 3.5MB initial bundle; splitting it dropped the initial chunk to ~200KB gzipped ~64KB (see `docs/performance.md` for the measured numbers).

## Command registry

`apps/web/src/commands/registry.ts` is the single source of truth for "things the app can do" (SPEC section 25/55). Features register commands on mount via `useRegisterCommands`/`commandRegistry.registerAll` rather than wiring a keyboard shortcut directly to a component method. The command palette (`⌘K`/`⌘⇧P`) and quick-open (`⌘P`) both read from this registry - there's no separate "palette-only" command list to keep in sync.

## Cross-origin isolation

`SharedArrayBuffer` and threaded WASM require `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Set in two places:

- Dev server: `vite.config.ts`'s `crossOriginIsolationHeaders` plugin
- Production: `infra/nginx.conf`

If you put another reverse proxy in front of the nginx container (Coolify's own proxy, Cloudflare, Traefik), **it must forward these headers unchanged** - a proxy that strips unrecognized headers will silently disable `SharedArrayBuffer`, and the app should (once the runtime package lands) detect and report that rather than fail mysteriously, per SPEC section 40.

## What's not built yet

`packages/runtime`, `terminal`, `git`, `language-server`, `collaboration`, `ai`, `sync`, `security`, `protocol`, and `apps/api`/`apps/worker` are specified in `SPEC.md` and named in the repo structure but not implemented - seeing them in a directory listing or import path is not evidence they exist. The web app's Terminal/Git/AI panels say so explicitly in their empty states rather than showing fake UI. See the README's Roadmap section for build order.
