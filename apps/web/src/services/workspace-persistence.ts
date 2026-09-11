import {
  openDb,
  reqToPromise,
  txDone,
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceMetadata,
  type WorkspaceSession,
  type WorkspaceSettings,
} from "@knox/shared";

/**
 * Local persistence for workspace metadata, session (open tabs, cursor
 * positions, layout) and settings - SPEC section 6. Deliberately separate
 * from file *contents* (which live in the VirtualFileSystem backend) so a
 * corrupted session never risks project data, and vice versa.
 */
const DB_NAME = "knox-app";
const DB_VERSION = 1;
const WORKSPACES = "workspaces";
const SESSIONS = "sessions";
const SETTINGS = "settings";
const DIRECTORY_HANDLES = "directoryHandles";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  dbPromise ??= openDb(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(WORKSPACES, { keyPath: "id" });
    db.createObjectStore(SESSIONS, { keyPath: "workspaceId" });
    db.createObjectStore(SETTINGS, { keyPath: "workspaceId" });
    // Chromium-family browsers support storing FileSystemDirectoryHandle
    // via structured clone; Firefox/Safari don't expose the picker at all
    // (gated by FileSystemAccessBackend.isSupported()), so this store is
    // simply unused there.
    db.createObjectStore(DIRECTORY_HANDLES, { keyPath: "workspaceId" });
  });
  return dbPromise;
}

/** Persists the user-granted directory handle so it can be re-requested on reload (SPEC section 5). */
export async function saveDirectoryHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(DIRECTORY_HANDLES, "readwrite");
  tx.objectStore(DIRECTORY_HANDLES).put({ workspaceId, handle });
  await txDone(tx);
}

export async function getDirectoryHandle(workspaceId: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await getDb();
  const tx = db.transaction(DIRECTORY_HANDLES, "readonly");
  const record = await reqToPromise<{ workspaceId: string; handle: FileSystemDirectoryHandle } | undefined>(
    tx.objectStore(DIRECTORY_HANDLES).get(workspaceId),
  );
  return record?.handle;
}

export async function listWorkspaces(): Promise<WorkspaceMetadata[]> {
  const db = await getDb();
  const tx = db.transaction(WORKSPACES, "readonly");
  const all = await reqToPromise<WorkspaceMetadata[]>(tx.objectStore(WORKSPACES).getAll());
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function saveWorkspaceMeta(meta: WorkspaceMetadata): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(WORKSPACES, "readwrite");
  tx.objectStore(WORKSPACES).put(meta);
  await txDone(tx);
}

export async function deleteWorkspaceMeta(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([WORKSPACES, SESSIONS, SETTINGS], "readwrite");
  tx.objectStore(WORKSPACES).delete(id);
  tx.objectStore(SESSIONS).delete(id);
  tx.objectStore(SETTINGS).delete(id);
  await txDone(tx);
}

export async function getSession(workspaceId: string): Promise<WorkspaceSession | undefined> {
  const db = await getDb();
  const tx = db.transaction(SESSIONS, "readonly");
  return reqToPromise(tx.objectStore(SESSIONS).get(workspaceId));
}

export async function saveSession(session: WorkspaceSession): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(SESSIONS, "readwrite");
  tx.objectStore(SESSIONS).put(session);
  await txDone(tx);
}

export async function getSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const db = await getDb();
  const tx = db.transaction(SETTINGS, "readonly");
  const record = await reqToPromise<{ workspaceId: string; settings: WorkspaceSettings } | undefined>(
    tx.objectStore(SETTINGS).get(workspaceId),
  );
  return record?.settings ?? DEFAULT_WORKSPACE_SETTINGS;
}

export async function saveSettings(workspaceId: string, settings: WorkspaceSettings): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(SETTINGS, "readwrite");
  tx.objectStore(SETTINGS).put({ workspaceId, settings });
  await txDone(tx);
}
