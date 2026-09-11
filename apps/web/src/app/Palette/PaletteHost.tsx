import { useCallback, useEffect, useState } from "react";
import { basename } from "@knox/shared";
import { Palette, type PaletteItem } from "./Palette";
import { commandRegistry } from "../../commands/registry";
import { fuzzySearch } from "../../commands/fuzzy";
import { useWorkspaceStore } from "../../state/workspace-store";
import { useEditorStore } from "../../state/editor-store";
import { listAllFiles } from "../../services/file-index";

type Mode = "none" | "commands" | "files";

/**
 * Owns the global shortcuts for Command Palette (⌘K / ⌘⇧P) and Quick Open
 * (⌘P), and renders whichever is active. A single host keeps the shortcut
 * wiring in one place instead of scattered across components.
 */
export function PaletteHost(): React.ReactElement | null {
  const [mode, setMode] = useState<Mode>("none");
  const fs = useWorkspaceStore((s) => s.fs);
  const openFile = useEditorStore((s) => s.openFile);
  const [fileList, setFileList] = useState<string[] | null>(null);

  const closePalette = useCallback(() => setMode("none"), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode("commands");
      } else if (e.key.toLowerCase() === "p" && e.shiftKey) {
        e.preventDefault();
        setMode("commands");
      } else if (e.key.toLowerCase() === "p" && !e.shiftKey) {
        // Quick Open is global even while the editor has focus.
        e.preventDefault();
        setMode("files");
      } else if (e.key === "Escape") {
        setMode("none");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    if (mode !== "files" || !fs) return;
    let cancelled = false;
    void listAllFiles(fs).then((files) => {
      if (!cancelled) setFileList(files);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fs]);

  if (mode === "commands") {
    return (
      <Palette
        title="Command Palette"
        placeholder="Type a command…"
        emptyMessage="No matching commands"
        onClose={closePalette}
        search={(query) => {
          const commands = commandRegistry.list();
          const matches = query ? fuzzySearch(query, commands, (c) => c.title) : commands.map((c) => ({ item: c, score: 0, indices: [] }));
          return matches.map(
            (m): PaletteItem => ({
              id: m.item.id,
              label: m.item.title,
              sublabel: m.item.shortcut ?? m.item.category,
              run: m.item.run,
            }),
          );
        }}
      />
    );
  }

  if (mode === "files") {
    return (
      <Palette
        title="Quick Open"
        placeholder="Go to file…"
        emptyMessage={fileList === null ? "Indexing files…" : "No matching files"}
        onClose={closePalette}
        search={(query) => {
          const files = fileList ?? [];
          const matches = query ? fuzzySearch(query, files, (f) => f) : files.slice(0, 100).map((f) => ({ item: f, score: 0, indices: [] }));
          return matches.map(
            (m): PaletteItem => ({
              id: m.item,
              label: basename(m.item),
              sublabel: m.item,
              run: () => openFile(m.item, { preview: true }),
            }),
          );
        }}
      />
    );
  }

  return null;
}
