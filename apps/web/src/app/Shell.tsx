import { useEffect } from "react";
import type { VirtualFileSystem, WorkspaceMetadata } from "@knox/shared";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { Explorer } from "./Explorer/Explorer";
import { EditorArea } from "./EditorArea/EditorArea";
import { BottomPanel } from "./BottomPanel/BottomPanel";
import { AiPanel } from "./AiPanel/AiPanel";
import { StatusBar } from "./StatusBar";
import { PaletteHost } from "./Palette/PaletteHost";
import { useLayoutStore } from "../state/layout-store";
import { useEditorStore } from "../state/editor-store";
import { useDragResize } from "../hooks/useDragResize";
import { commandRegistry } from "../commands/registry";
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
    ]);
  }, [sidebarVisible, panelVisible, aiPanelVisible, setSidebarVisible, setPanelVisible, setAiPanelVisible, toggleDistractionFree]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "b" && !e.shiftKey) {
        e.preventDefault();
        void commandRegistry.run("view.toggleSidebar");
      } else if (e.key === "`") {
        e.preventDefault();
        void commandRegistry.run("view.toggleTerminal");
      } else if (e.key.toLowerCase() === "w") {
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
              <Explorer fs={fs} workspaceName={metadata.name} />
            </div>
            <div className="knox-shell__splitter" onPointerDown={sidebarResize.onPointerDown} />
          </>
        )}
        <div className="knox-shell__main">
          <EditorArea />
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
    </div>
  );
}
