// Never throws; unsupported just means false, callers must degrade gracefully.
export interface FsCapabilities {
  opfs: boolean;
  fileSystemAccess: boolean;
  indexedDb: boolean;
  storagePersistence: boolean;
}

export async function detectFsCapabilities(): Promise<FsCapabilities> {
  const opfs = "storage" in navigator && typeof navigator.storage?.getDirectory === "function";
  const fileSystemAccess =
    typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
  const indexedDbSupported = typeof indexedDB !== "undefined";
  const storagePersistence = typeof navigator.storage?.persist === "function";
  return {
    opfs,
    fileSystemAccess,
    indexedDb: indexedDbSupported,
    storagePersistence,
  };
}
