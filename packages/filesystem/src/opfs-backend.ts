import { FileSystemHandleBackend } from "./handle-fs.js";

// Primary VirtualFileSystem backend; async API works from both main thread and workers.
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
