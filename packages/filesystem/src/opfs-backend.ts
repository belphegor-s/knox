import { FileSystemHandleBackend } from "./handle-fs.js";

/**
 * OPFS-backed VirtualFileSystem - the primary backend (SPEC section 5).
 * Uses the async OPFS API (createWritable) so it works identically from
 * the main thread and from workers, rather than sync access handles
 * (worker-only, faster but narrower support).
 */
export class OpfsFileSystem extends FileSystemHandleBackend {
  static async isSupported(): Promise<boolean> {
    try {
      return "storage" in navigator && typeof navigator.storage.getDirectory === "function";
    } catch {
      return false;
    }
  }

  static async create(workspaceId: string): Promise<OpfsFileSystem> {
    const opfsRoot = await navigator.storage.getDirectory();
    const workspaces = await opfsRoot.getDirectoryHandle("workspaces", { create: true });
    const root = await workspaces.getDirectoryHandle(workspaceId, { create: true });
    return new OpfsFileSystem(workspaceId, root);
  }

  static async deleteWorkspace(workspaceId: string): Promise<void> {
    const opfsRoot = await navigator.storage.getDirectory();
    const workspaces = await opfsRoot.getDirectoryHandle("workspaces", { create: true });
    await workspaces.removeEntry(workspaceId, { recursive: true }).catch(() => {});
  }
}
