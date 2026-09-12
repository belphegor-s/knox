import { FileSystemHandleBackend } from "./handle-fs.js";

// Lets a user open a real folder on disk; permission must be re-verified on reload.
export class FileSystemAccessBackend extends FileSystemHandleBackend {
  private constructor(
    workspaceId: string,
    root: FileSystemDirectoryHandle,
    readonly directoryHandle: FileSystemDirectoryHandle,
  ) {
    super(workspaceId, root);
  }

  static isSupported(): boolean {
    return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
  }

  /** Must be called from a user gesture (click handler), not on page load. */
  static async pickDirectory(workspaceId: string): Promise<FileSystemAccessBackend> {
    const picker = (window as unknown as {
      showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    const handle = await picker({ mode: "readwrite" });
    return new FileSystemAccessBackend(workspaceId, handle, handle);
  }

  static async fromHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<FileSystemAccessBackend> {
    return new FileSystemAccessBackend(workspaceId, handle, handle);
  }

  /** Re-checks (and if needed, re-requests) readwrite permission for a handle restored from IndexedDB. */
  async ensurePermission(): Promise<"granted" | "denied" | "prompt"> {
    const handle = this.directoryHandle as unknown as {
      queryPermission: (opts: { mode: string }) => Promise<"granted" | "denied" | "prompt">;
      requestPermission: (opts: { mode: string }) => Promise<"granted" | "denied" | "prompt">;
    };
    const current = await handle.queryPermission({ mode: "readwrite" });
    if (current === "granted") return current;
    return handle.requestPermission({ mode: "readwrite" });
  }
}
