import { openDb, reqToPromise, txDone } from "@knox/shared";

const DB_NAME = "knox-git-remotes";
const DB_VERSION = 1;
const REMOTES = "remotes";

export interface GitRemoteSettings {
  workspaceId: string;
  url: string;
  username: string;
  /** A host's personal access token, stored the same way an AI provider's API key is:
   * this IndexedDB store only, sent only in the Git request to that same host. */
  token: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  dbPromise ??= openDb(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(REMOTES, { keyPath: "workspaceId" });
  });
  return dbPromise;
}

export async function getRemoteSettings(workspaceId: string): Promise<GitRemoteSettings | null> {
  const db = await getDb();
  const tx = db.transaction(REMOTES, "readonly");
  const value = await reqToPromise<GitRemoteSettings | undefined>(tx.objectStore(REMOTES).get(workspaceId));
  return value ?? null;
}

export async function saveRemoteSettings(settings: GitRemoteSettings): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(REMOTES, "readwrite");
  tx.objectStore(REMOTES).put(settings);
  await txDone(tx);
}

export async function deleteRemoteSettings(workspaceId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(REMOTES, "readwrite");
  tx.objectStore(REMOTES).delete(workspaceId);
  await txDone(tx);
}
