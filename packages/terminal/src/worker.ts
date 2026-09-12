import { createFileSystem, FileSystemAccessBackend } from "@knox/filesystem";
import { exposeRpc, type VirtualFileSystem } from "@knox/shared";
import { Shell } from "./shell.js";

let shell: Shell;

async function init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void> {
  const vfs: VirtualFileSystem =
    fsBackend === "file-system-access" && directoryHandle
      ? await FileSystemAccessBackend.fromHandle(workspaceId, directoryHandle)
      : await createFileSystem(workspaceId);
  shell = new Shell(vfs);
}

function write(stream: "stdout" | "stderr", text: string): void {
  postMessage({ type: "output", stream, text });
}

exposeRpc({
  init,
  execute: (line: string) => shell.execute(line, write),
  getCwd: () => Promise.resolve(shell.cwd),
});
