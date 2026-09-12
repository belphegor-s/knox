import { openDb, reqToPromise, txDone } from "@knox/shared";
import type { ProviderConfig } from "@knox/ai";

const DB_NAME = "knox-ai";
const DB_VERSION = 1;
const PROVIDERS = "providers";
const ACTIVE = "active";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  dbPromise ??= openDb(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(PROVIDERS, { keyPath: "id" });
    db.createObjectStore(ACTIVE);
  });
  return dbPromise;
}

/** Provider config (including the API key) never leaves this IndexedDB store except in a direct request to that provider's own endpoint. */
export async function listProviders(): Promise<ProviderConfig[]> {
  const db = await getDb();
  const tx = db.transaction(PROVIDERS, "readonly");
  return reqToPromise(tx.objectStore(PROVIDERS).getAll());
}

export async function saveProvider(config: ProviderConfig): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PROVIDERS, "readwrite");
  tx.objectStore(PROVIDERS).put(config);
  await txDone(tx);
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PROVIDERS, "readwrite");
  tx.objectStore(PROVIDERS).delete(id);
  await txDone(tx);
}

export async function getActiveProviderId(): Promise<string | null> {
  const db = await getDb();
  const tx = db.transaction(ACTIVE, "readonly");
  const value = await reqToPromise<string | undefined>(tx.objectStore(ACTIVE).get("id"));
  return value ?? null;
}

export async function setActiveProviderId(id: string | null): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(ACTIVE, "readwrite");
  if (id) tx.objectStore(ACTIVE).put(id, "id");
  else tx.objectStore(ACTIVE).delete("id");
  await txDone(tx);
}
