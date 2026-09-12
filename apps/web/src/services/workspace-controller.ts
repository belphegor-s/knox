import { createFileSystem, detectFsCapabilities, FileSystemAccessBackend } from "@knox/filesystem";
import { createId, knoxEvents, type WorkspaceMetadata } from "@knox/shared";
import { useWorkspaceStore } from "../state/workspace-store";
import { useEditorStore, type EditorTab } from "../state/editor-store";
import { useLayoutStore, DEFAULT_LAYOUT, getLayoutSnapshot } from "../state/layout-store";
import * as store from "./workspace-persistence";

const STARTER_README = `# New project

Welcome to Knox. This file lives entirely in your browser (OPFS/IndexedDB) -
nothing was uploaded anywhere to create this project.

Try:
- Creating a new file from the explorer
- Opening a terminal (Ctrl/Cmd + \`)
- Running your code locally
`;

export async function createWorkspace(name: string): Promise<WorkspaceMetadata> {
  const caps = await detectFsCapabilities();
  const id = createId("ws");
  const now = Date.now();
  const metadata: WorkspaceMetadata = {
    id,
    name,
    createdAt: now,
    lastOpenedAt: now,
    fsBackend: caps.opfs ? "opfs" : "indexeddb",
    hasDirectoryHandle: false,
  };
  const fs = await createFileSystem(id);
  await fs.writeFile("/README.md", STARTER_README);
  await store.saveWorkspaceMeta(metadata);
  useWorkspaceStore.getState().setReady(metadata, fs);
  useEditorStore.getState().hydrate([], null);
  useLayoutStore.getState().hydrate(DEFAULT_LAYOUT);
  knoxEvents.emit("WORKSPACE_LOADED", { workspaceId: id, rootPath: "/" });
  return metadata;
}

// must be called from a user gesture
export async function createWorkspaceFromDirectory(): Promise<WorkspaceMetadata> {
  const backend = await FileSystemAccessBackend.pickDirectory(createId("ws"));
  const now = Date.now();
  const metadata: WorkspaceMetadata = {
    id: backend.id,
    name: backend.directoryHandle.name,
    createdAt: now,
    lastOpenedAt: now,
    fsBackend: "file-system-access",
    hasDirectoryHandle: true,
  };
  await store.saveDirectoryHandle(backend.id, backend.directoryHandle);
  await store.saveWorkspaceMeta(metadata);
  useWorkspaceStore.getState().setReady(metadata, backend);
  useEditorStore.getState().hydrate([], null);
  useLayoutStore.getState().hydrate(DEFAULT_LAYOUT);
  knoxEvents.emit("WORKSPACE_LOADED", { workspaceId: backend.id, rootPath: "/" });
  return metadata;
}

async function openFsaWorkspace(metadata: WorkspaceMetadata): Promise<FileSystemAccessBackend> {
  const handle = await store.getDirectoryHandle(metadata.id);
  if (!handle) {
    throw new Error(
      `"${metadata.name}" was opened from a local folder, but the folder handle wasn't found. ` +
        `Re-open it via "Open folder" - browsers don't let sites remember folder access across a full browser restart in every case.`,
    );
  }
  const backend = await FileSystemAccessBackend.fromHandle(metadata.id, handle);
  const permission = await backend.ensurePermission();
  if (permission !== "granted") {
    throw new Error(`Permission to "${metadata.name}" was not granted. Re-open the folder to grant access again.`);
  }
  return backend;
}

export async function openWorkspace(id: string): Promise<void> {
  useWorkspaceStore.getState().setLoading();
  try {
    const all = await store.listWorkspaces();
    const metadata = all.find((w) => w.id === id);
    if (!metadata) throw new Error(`Workspace "${id}" was not found locally.`);
    const fs = metadata.fsBackend === "file-system-access" ? await openFsaWorkspace(metadata) : await createFileSystem(id);
    metadata.lastOpenedAt = Date.now();
    await store.saveWorkspaceMeta(metadata);
    useWorkspaceStore.getState().setReady(metadata, fs);

    const session = await store.getSession(id);
    if (session) {
      useEditorStore.getState().hydrate(session.openTabs as EditorTab[], session.activeTabPath);
      useLayoutStore.getState().hydrate(session.layout);
    } else {
      useEditorStore.getState().hydrate([], null);
      useLayoutStore.getState().hydrate(DEFAULT_LAYOUT);
    }
    knoxEvents.emit("WORKSPACE_LOADED", { workspaceId: id, rootPath: "/" });
  } catch (err) {
    useWorkspaceStore.getState().setError(err instanceof Error ? err.message : String(err));
  }
}

export async function listRecentWorkspaces(): Promise<WorkspaceMetadata[]> {
  return store.listWorkspaces();
}

export async function deleteWorkspace(id: string): Promise<void> {
  await store.deleteWorkspaceMeta(id);
}

// Debounced session autosave; idempotent, call once at startup.
export function startSessionAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    const ws = useWorkspaceStore.getState();
    if (ws.phase !== "ready" || !ws.metadata) return;
    const editor = useEditorStore.getState();
    void store.saveSession({
      workspaceId: ws.metadata.id,
      openTabs: editor.tabs,
      activeTabPath: editor.activePath,
      layout: getLayoutSnapshot(),
      updatedAt: Date.now(),
    });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };

  const unsubEditor = useEditorStore.subscribe(schedule);
  const unsubLayout = useLayoutStore.subscribe(schedule);
  const onBeforeUnload = () => flush();
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    unsubEditor();
    unsubLayout();
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (timer) clearTimeout(timer);
  };
}
