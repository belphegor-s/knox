import { createId, createRpcClient, type SearchMatch, type SearchOptions } from "@knox/shared";
import SearchWorker from "./worker.ts?worker";

interface SearchRpcApi {
  [method: string]: (...args: any[]) => Promise<any>;
  init(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void>;
  search(requestId: string, query: string, options?: Omit<SearchOptions, "signal">): Promise<SearchMatch[]>;
  cancel(requestId: string): Promise<void>;
}

/** Runs text search off the main thread; a newer search always wins over a stale in-flight one. */
export class SearchClient {
  private latestRequestId: string | null = null;

  private constructor(
    private readonly worker: Worker,
    private readonly api: SearchRpcApi,
  ) {}

  static async create(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<SearchClient> {
    const worker = new SearchWorker();
    const api = createRpcClient<SearchRpcApi>(worker);
    await api.init(workspaceId, fsBackend, directoryHandle);
    return new SearchClient(worker, api);
  }

  async search(query: string, options?: Omit<SearchOptions, "signal">): Promise<SearchMatch[]> {
    if (!query) return [];
    if (this.latestRequestId) void this.api.cancel(this.latestRequestId);
    const requestId = createId("search");
    this.latestRequestId = requestId;
    const results = await this.api.search(requestId, query, options);
    return this.latestRequestId === requestId ? results : [];
  }

  dispose(): void {
    this.worker.terminate();
  }
}
