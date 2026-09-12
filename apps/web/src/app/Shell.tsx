import { useEffect, useState } from "react";
import { debounce, type VirtualFileSystem, type WorkspaceMetadata } from "@knox/shared";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { Explorer } from "./Explorer/Explorer";
import { EditorArea } from "./EditorArea/EditorArea";
import { GitPanel } from "./Git/GitPanel";
import { DiffView } from "./Git/DiffView";
import { SearchPanel } from "./Search/SearchPanel";
import { BottomPanel } from "./BottomPanel/BottomPanel";
import { AiPanel } from "./AiPanel/AiPanel";
import { StatusBar } from "./StatusBar";
import { PaletteHost } from "./Palette/PaletteHost";
import { useLayoutStore } from "../state/layout-store";
import { useEditorStore } from "../state/editor-store";
import { useGitStore } from "../state/git-store";
import { useSearchStore } from "../state/search-store";
import { useDragResize } from "../hooks/useDragResize";
import { commandRegistry } from "../commands/registry";
import { getDirectoryHandle } from "../services/workspace-persistence";
import "./Shell.css";

export function Shell({ fs, metadata }: { fs: VirtualFileSystem; metadata: WorkspaceMetadata }): React.ReactElement {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setSidebarVisible = useLayoutStore((s) => s.setSidebarVisible);
  const aiPanelVisible = useLayoutStore((s) => s.aiPanelVisible);
  const aiPanelWidth = useLayoutStore((s) => s.aiPanelWidth);
  const setAiPanelWidth = useLayoutStore((s) => s.setAiPanelWidth);
  const setAiPanelVisible = useLayoutStore((s) => s.setAiPanelVisible);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const distractionFree = useLayoutStore((s) => s.distractionFree);
  const toggleDistractionFree = useLayoutStore((s) => s.toggleDistractionFree);
  const activeActivityView = useLayoutStore((s) => s.activeActivityView);
  const viewingDiff = useGitStore((s) => s.viewingDiff);
  const connectGit = useGitStore((s) => s.connect);
  const resetGit = useGitStore((s) => s.reset);
  const connectSearch = useSearchStore((s) => s.connect);
  const resetSearch = useSearchStore((s) => s.reset);
  const toggleTerminalFocus = useLayoutStore((s) => s.toggleTerminalFocus);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  async function createUntitledFile(): Promise<void> {
    let n = 1;
    let path = `/untitled-${n}.txt`;
    while (await fs.exists(path)) {
      n++;
      path = `/untitled-${n}.txt`;
    }
    await fs.writeFile(path, "");
    useEditorStore.getState().openFile(path, { preview: false });
  }

  useEffect(() => {
    void (async () => {
      const handle = metadata.fsBackend === "file-system-access" ? await getDirectoryHandle(metadata.id) : undefined;
      await connectGit(metadata.id, metadata.fsBackend, handle);
      await connectSearch(metadata.id, metadata.fsBackend, handle);
    })();
    return () => {
      resetGit();
      resetSearch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata.id]);

  useEffect(() => {
    const refresh = debounce(() => {
      if (useGitStore.getState().isRepo) void useGitStore.getState().refresh();
    }, 400);
    const sub = fs.watch("/", refresh);
    return () => {
      sub.dispose();
      refresh.cancel();
    };
  }, [fs]);

  const sidebarResize = useDragResize({ axis: "x", grows: "end", value: sidebarWidth, min: 180, max: 480, onChange: setSidebarWidth });
  const aiResize = useDragResize({ axis: "x", grows: "start", value: aiPanelWidth, min: 260, max: 560, onChange: setAiPanelWidth });

  useEffect(() => {
    return commandRegistry.registerAll([
      {
        id: "view.toggleSidebar",
        title: "View: Toggle Sidebar",
        category: "Panels",
        shortcut: "⌘B",
        run: () => setSidebarVisible(!sidebarVisible),
      },
      {
        id: "view.toggleTerminal",
        title: "View: Toggle Terminal",
        category: "Terminal",
        shortcut: "⌘`",
        run: toggleTerminalFocus,
      },
      {
        id: "view.togglePanel",
        title: "View: Toggle Panel",
        category: "Panels",
        shortcut: "⌘J",
        run: () => setPanelVisible(!panelVisible),
      },
      {
        id: "view.toggleAiPanel",
        title: "View: Toggle AI Panel",
        category: "AI",
        run: () => setAiPanelVisible(!aiPanelVisible),
      },
      {
        id: "view.toggleDistractionFree",
        title: "View: Toggle Distraction-Free Mode",
        category: "View",
        run: toggleDistractionFree,
      },
      {
        id: "file.new",
        title: "File: New File",
        category: "File",
        shortcut: "⌘N",
        run: () => void createUntitledFile(),
      },
      {
        id: "file.closeEditor",
        title: "File: Close Editor",
        category: "File",
        shortcut: "⌘W",
        run: () => {
          const { activePath, closeTab } = useEditorStore.getState();
          if (activePath) closeTab(activePath);
        },
      },
      {
        id: "file.closeAll",
        title: "File: Close All Editors",
        category: "File",
        run: () => useEditorStore.getState().closeAll(),
      },
      {
        id: "view.showSearch",
        title: "View: Show Search",
        category: "Navigation",
        shortcut: "⌘⇧F",
        run: () => {
          useLayoutStore.getState().setActiveActivityView("search");
        },
      },
      {
        id: "help.keyboardShortcuts",
        title: "Help: Keyboard Shortcuts",
        category: "View",
        shortcut: "⌘⇧/",
        run: () => setShortcutsHelpOpen(true),
      },
    ]);
  }, [sidebarVisible, panelVisible, aiPanelVisible, toggleTerminalFocus, setSidebarVisible, setPanelVisible, setAiPanelVisible, toggleDistractionFree]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        void commandRegistry.run("view.toggleSidebar");
      } else if (key === "j" && !e.shiftKey) {
        e.preventDefault();
        void commandRegistry.run("view.togglePanel");
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        void commandRegistry.run("view.showSearch");
      } else if (key === "/" && e.shiftKey) {
        e.preventDefault();
        void commandRegistry.run("help.keyboardShortcuts");
      } else if (key === "n" && !e.shiftKey) {
        // Browsers may reserve this for a new window; harmless to also try.
        e.preventDefault();
        void commandRegistry.run("file.new");
      } else if (e.key === "`") {
        e.preventDefault();
        void commandRegistry.run("view.toggleTerminal");
      } else if (key === "w") {
        // Browsers may reserve plain ⌘W for closing the tab; ⌘⇧W is a guaranteed-safe alternate.
        e.preventDefault();
        void commandRegistry.run("file.closeEditor");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`knox-shell${distractionFree ? " knox-shell--distraction-free" : ""}`}>
      {!distractionFree && <TitleBar metadata={metadata} />}
      <div className="knox-shell__body">
        {!distractionFree && <ActivityBar />}
        {!distractionFree && sidebarVisible && (
          <>
            <div className="knox-shell__sidebar" style={{ width: sidebarWidth }}>
              {activeActivityView === "git" ? (
                <GitPanel />
              ) : activeActivityView === "search" ? (
                <SearchPanel />
              ) : (
                <Explorer fs={fs} workspaceName={metadata.name} />
              )}
            </div>
            <div className="knox-shell__splitter" onPointerDown={sidebarResize.onPointerDown} />
          </>
        )}
        <div className="knox-shell__main">
          {viewingDiff ? <DiffView /> : <EditorArea />}
          <BottomPanel />
        </div>
        {!distractionFree && aiPanelVisible && (
          <>
            <div className="knox-shell__splitter" onPointerDown={aiResize.onPointerDown} />
            <div className="knox-shell__ai" style={{ width: aiPanelWidth }}>
              <AiPanel />
            </div>
          </>
        )}
      </div>
      {!distractionFree && <StatusBar />}
      <PaletteHost />
      {shortcutsHelpOpen && <KeyboardShortcutsHelp onClose={() => setShortcutsHelpOpen(false)} />}
    </div>
  );
}
