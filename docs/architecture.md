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

## The worker-per-feature pattern

Git, Terminal, and Search each follow the same shape: a client class on the main thread (`GitClient`, `TerminalSession`, `SearchClient`) spawns a dedicated worker via a `?worker` import, and the worker constructs its *own* `VirtualFileSystem` instance for the same workspace rather than the main thread trying to transfer one. This works because OPFS and IndexedDB are natively available inside workers - both contexts end up reading/writing the same underlying storage. A File System Access directory handle is the one case that needs an explicit transfer, and it structured-clones across `postMessage` without extra plumbing.

`packages/shared/src/rpc.ts` is the generic request/response layer underneath all three (`createRpcClient`/`exposeRpc`). Streaming output (terminal stdout/stderr, in the future anything else that doesn't fit request/response) rides on unsolicited `postMessage({type: "output", ...})` calls the client listens for separately, since RPC itself is strictly one request → one response.

## What's not built yet

`language-server` (beyond Monaco's bundled TS/JS), `collaboration`, `sync`, `security` (the AI permission model - secret detection itself already lives in `packages/ai`), `protocol`, and `apps/api`/`apps/worker` are specified in `SPEC.md` and named in the repo structure but not implemented - seeing a directory is not evidence of what's inside it. The web app's AI panel is honest about this too: the chat itself is real, but there's no agent loop, no patch-apply flow, and no permission-gated tool calls yet. See the README's Roadmap section for build order.
