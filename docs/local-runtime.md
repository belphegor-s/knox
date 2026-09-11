# Local runtime

How Knox behaves entirely inside the browser, with no backend reachable.

## Filesystem backend selection

`createFileSystem(workspaceId)` (`packages/filesystem/src/create.ts`) picks a backend at workspace-creation time:

1. **OPFS**, if `navigator.storage.getDirectory` exists and doesn't throw (some privacy-hardened browsers/private-browsing contexts advertise OPFS but reject actual use - this is caught and falls through).
2. **IndexedDB**, otherwise.

A workspace's backend is fixed at creation - Knox doesn't migrate a workspace from IndexedDB to OPFS later. `WorkspaceMetadata.fsBackend` records which one a given workspace uses, shown in the title bar.

A third backend, **File System Access** (`FileSystemAccessBackend`), is opt-in only: `Welcome → Open folder`. It's never a silent fallback because it requires a user gesture and produces a workspace tied to a real folder on disk, which has different semantics (the OS can change it outside the browser; SPEC section 5 "files deleted externally").

### Browser support (as of this writing)

| Feature | Chromium | Firefox | Safari |
|---|---|---|---|
| OPFS | Yes | Yes | Yes (16.4+) |
| File System Access (`showDirectoryPicker`) | Yes | No | No |
| `SharedArrayBuffer` (needs COOP/COEP, see `docs/architecture.md`) | Yes | Yes | Yes |

Where a capability is missing, `detectFsCapabilities()` reports `false` and the UI degrades (Welcome's "Open folder" button is disabled with an explanatory tooltip) rather than the app crashing or silently no-op'ing - SPEC section 93.

## What `watch()` can and can't see

None of OPFS, IndexedDB, or the File System Access API provide native cross-tab/cross-worker change notification. Every backend's `watch()` is therefore scoped to **writes made through that specific `VirtualFileSystem` instance** - sufficient for everything in this app today (the explorer and the editor share one instance per workspace), but it will not notice:

- A second browser tab with the same OPFS-backed workspace open, editing concurrently
- A user editing a File-System-Access-backed folder with a native external editor at the same time

Both are real, disclosed limitations rather than bugs to silently work around - a future `packages/sync`/collaboration layer is the right place to solve true multi-writer consistency (SPEC section 16), not a filesystem-level watch hack.

## Quota and large files

- `usage()` reports `navigator.storage.estimate()` where available; both OPFS and IndexedDB share the browser's overall origin quota.
- Files over 100MB (`MAX_OPENABLE_BYTES`, `packages/editor/src/large-file.ts`) are refused by the editor with an explicit explanation rather than attempting to load them and freezing the tab.
- Between 2MB and 20MB, the editor drops minimap/bracket-colorization/folding/whitespace-rendering; above 20MB it also drops hover/quick-suggestions/parameter-hints - degrading capability before the browser struggles, not after (SPEC section 33).
- Quota-exceeded writes surface as `FileSystemError` with `code: "QUOTA_EXCEEDED"` - plumbed through to callers today; a user-facing recovery flow (SPEC section 78's "workspace recovery" screen) is not yet built.

## Offline

The production build precaches the entire app shell (all Monaco language chunks included, ~12MB) via a service worker (`apps/web/src/sw.ts`, `workbox-precaching`). After one successful load:

- Reloading with no network works - verified with `scripts/offline-check.mjs`: load once online, create and save a file, go offline (`context.setOffline(true)`), reload, confirm the workspace, file tree, and file content all survive. Last run: workspace restored, tree showed both files, and the saved content round-tripped correctly with zero console errors.
- All file operations, the editor, tabs, and session restore work fully offline, because none of them ever depended on the network to begin with - this isn't a fallback path, it's the only path that exists today.

Cloud-dependent features (sync, collaboration, cloud execution, hosted AI) aren't built yet, so there's no "offline degrades cloud features" behavior to demonstrate - see `docs/cloud-runtime.md` for what that will look like once they exist.

## Session restore

On boot, `App.tsx` checks for a most-recently-opened workspace (`listRecentWorkspaces()`) and reopens it automatically before ever showing the Welcome screen - matching SPEC section 2's "editor opens almost immediately" and section 6's crash-recovery flow (reopen → restore workspace → restore tabs → restore cursor positions). File-System-Access-backed workspaces are the one case where this can visibly fail: some browsers require a fresh user gesture to re-grant folder permission, so auto-restore for those can end in the error state rather than silently succeeding - surfaced with a specific message, not a generic failure.
