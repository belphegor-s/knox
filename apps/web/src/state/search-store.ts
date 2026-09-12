import { create } from "zustand";
import { SearchClient } from "@knox/search";
import { debounce, type SearchMatch } from "@knox/shared";

interface SearchState {
  client: SearchClient | null;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  results: SearchMatch[];
  loading: boolean;

  connect(workspaceId: string, fsBackend: string, directoryHandle?: FileSystemDirectoryHandle): Promise<void>;
  setQuery(query: string): void;
  toggleRegex(): void;
  toggleCaseSensitive(): void;
  runSearch(): Promise<void>;
  reset(): void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  client: null,
  query: "",
  regex: false,
  caseSensitive: false,
  results: [],
  loading: false,

  async connect(workspaceId, fsBackend, directoryHandle) {
    const client = await SearchClient.create(workspaceId, fsBackend, directoryHandle);
    set({ client });
  },

  setQuery(query) {
    set({ query, loading: !!query });
    debouncedSearch();
  },
  toggleRegex() {
    set((s) => ({ regex: !s.regex }));
    void get().runSearch();
  },
  toggleCaseSensitive() {
    set((s) => ({ caseSensitive: !s.caseSensitive }));
    void get().runSearch();
  },

  async runSearch() {
    const { client, query, regex, caseSensitive } = get();
    if (!client || !query) {
      set({ results: [], loading: false });
      return;
    }
    set({ loading: true });
    const results = await client.search(query, {
      regex,
      caseSensitive,
      maxResults: 500,
      exclude: ["node_modules/**", ".git/**", "dist/**"],
    });
    set({ results, loading: false });
  },

  reset() {
    get().client?.dispose();
    set({ client: null, query: "", results: [], loading: false });
  },
}));

const debouncedSearch = debounce(() => void useSearchStore.getState().runSearch(), 200);
