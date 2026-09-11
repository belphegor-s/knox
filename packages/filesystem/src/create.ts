import type { VirtualFileSystem } from "@knox/shared";
import { detectFsCapabilities } from "./detect.js";
import { OpfsFileSystem } from "./opfs-backend.js";
import { IndexedDbFileSystem } from "./indexeddb-backend.js";

/**
 * Picks the best available backend for a workspace: OPFS when supported,
 * IndexedDB otherwise. File System Access (user-picked folders) is opted
 * into explicitly via FileSystemAccessBackend.pickDirectory, since it
 * requires a user gesture and isn't a silent fallback.
 */
export async function createFileSystem(workspaceId: string): Promise<VirtualFileSystem> {
  const caps = await detectFsCapabilities();
  if (caps.opfs) {
    try {
      return await OpfsFileSystem.create(workspaceId);
    } catch {
      // Fall through to IndexedDB - some browsers advertise OPFS but reject
      // usage inside e.g. private browsing contexts.
    }
  }
  return IndexedDbFileSystem.create(workspaceId);
}
