import { useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry, VirtualFileSystem } from "@knox/shared";
import { joinPath } from "@knox/shared";

export interface TreeRow {
  path: string;
  name: string;
  type: "file" | "directory";
  depth: number;
  expanded: boolean;
  loading: boolean;
}

interface TreeState {
  expanded: Set<string>;
  children: Map<string, FileEntry[]>;
  loading: Set<string>;
}

const INITIAL_STATE: TreeState = { expanded: new Set(["/"]), children: new Map(), loading: new Set() };

// Lazy, flattened tree: readdir only on expand, flat rows feed straight into a virtualized list.
export function useFileTree(fs: VirtualFileSystem | null): {
  rows: TreeRow[];
  toggle: (path: string) => void;
  refresh: (path: string) => void;
  isExpanded: (path: string) => boolean;
} {
  const [state, setState] = useState<TreeState>(INITIAL_STATE);
  // mirror for reads in callbacks; setState updaters must stay pure (no fetching)
  const stateRef = useRef(state);
  stateRef.current = state;

  async function loadChildren(fsInstance: VirtualFileSystem, path: string): Promise<void> {
    setState((s) => ({ ...s, loading: new Set(s.loading).add(path) }));
    try {
      const entries = await fsInstance.readdir(path);
      setState((s) => {
        const children = new Map(s.children);
        children.set(path, entries);
        const loading = new Set(s.loading);
        loading.delete(path);
        return { ...s, children, loading };
      });
    } catch {
      setState((s) => {
        const loading = new Set(s.loading);
        loading.delete(path);
        return { ...s, loading };
      });
    }
  }

  useEffect(() => {
    if (!fs) return;
    setState(INITIAL_STATE);
    void loadChildren(fs, "/");
    const sub = fs.watch("/", (evt) => {
      const parent = evt.path.slice(0, evt.path.lastIndexOf("/")) || "/";
      if (stateRef.current.children.has(parent)) void loadChildren(fs, parent);
    });
    return () => sub.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs]);

  function toggle(path: string): void {
    const alreadyExpanded = stateRef.current.expanded.has(path);
    const needsLoad = !alreadyExpanded && fs && !stateRef.current.children.has(path);
    setState((s) => {
      const expanded = new Set(s.expanded);
      if (alreadyExpanded) expanded.delete(path);
      else expanded.add(path);
      return { ...s, expanded };
    });
    if (needsLoad && fs) void loadChildren(fs, path);
  }

  function refresh(path: string): void {
    if (fs) void loadChildren(fs, path);
  }

  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    function walk(dir: string, depth: number): void {
      const entries = state.children.get(dir);
      if (!entries) return;
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of sorted) {
        const path = joinPath(dir, entry.name);
        out.push({
          path,
          name: entry.name,
          type: entry.type === "directory" ? "directory" : "file",
          depth,
          expanded: state.expanded.has(path),
          loading: state.loading.has(path),
        });
        if (entry.type === "directory" && state.expanded.has(path)) {
          walk(path, depth + 1);
        }
      }
    }
    walk("/", 0);
    return out;
  }, [state]);

  return { rows, toggle, refresh, isExpanded: (path) => state.expanded.has(path) };
}
