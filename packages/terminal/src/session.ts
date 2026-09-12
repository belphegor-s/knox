import { createRpcClient } from "@knox/shared";
import TerminalWorker from "./worker.ts?worker";

interface TerminalRpcApi {
  [method: string]: (...args: any[]) => Promise<any>;
  init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void>;
  execute(line: string): Promise<number>;
  getCwd(): Promise<string>;
}

export type TerminalOutputHandler = (stream: "stdout" | "stderr", text: string) => void;

/** One shell session = one dedicated worker + one VirtualFileSystem instance for the workspace. */
export class TerminalSession {
  onOutput: TerminalOutputHandler | null = null;

  private constructor(
    private readonly worker: Worker,
    private readonly api: TerminalRpcApi,
  ) {
    worker.addEventListener("message", (event: MessageEvent) => {
      if (event.data?.type === "output") this.onOutput?.(event.data.stream, event.data.text);
    });
  }

  static async create(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<TerminalSession> {
    const worker = new TerminalWorker();
    const api = createRpcClient<TerminalRpcApi>(worker);
    const session = new TerminalSession(worker, api);
    await api.init(workspaceId, fsBackend, directoryHandle);
    return session;
  }

  execute(line: string): Promise<number> {
    return this.api.execute(line);
  }

  getCwd(): Promise<string> {
    return this.api.getCwd();
  }

  dispose(): void {
    this.worker.terminate();
  }
}
