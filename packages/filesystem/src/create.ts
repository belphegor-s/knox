import type { VirtualFileSystem } from "@knox/shared";
import { detectFsCapabilities } from "./detect.js";
import { OpfsFileSystem } from "./opfs-backend.js";
import { IndexedDbFileSystem } from "./indexeddb-backend.js";

export async function createFileSystem(workspaceId: string): Promise<VirtualFileSystem> {
  const caps = await detectFsCapabilities();
  if (caps.opfs) {
    try {
      return await OpfsFileSystem.create(workspaceId);
    } catch {
      // some browsers advertise OPFS but reject use (e.g. private browsing)
    }
  }
  return IndexedDbFileSystem.create(workspaceId);
}
