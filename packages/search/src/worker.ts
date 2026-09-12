import { createFileSystem, FileSystemAccessBackend } from "@knox/filesystem";
import { exposeRpc, type SearchOptions, type VirtualFileSystem } from "@knox/shared";

let vfs: VirtualFileSystem;
const controllers = new Map<string, AbortController>();

async function init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void> {
  vfs =
    fsBackend === "file-system-access" && directoryHandle
      ? await FileSystemAccessBackend.fromHandle(workspaceId, directoryHandle)
      : await createFileSystem(workspaceId);
}

async function search(requestId: string, query: string, options?: Omit<SearchOptions, "signal">) {
  const controller = new AbortController();
  controllers.set(requestId, controller);
  const results = [];
  try {
    for await (const match of vfs.search(query, { ...options, signal: controller.signal })) {
      results.push(match);
    }
  } catch {
    // aborted or errored mid-scan - return whatever was found so far
  } finally {
    controllers.delete(requestId);
  }
  return results;
}

function cancel(requestId: string): Promise<void> {
  controllers.get(requestId)?.abort();
  return Promise.resolve();
}

exposeRpc({ init, search, cancel });
