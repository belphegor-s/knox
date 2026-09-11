import { languageForPath } from "@knox/editor";
import { useEditorStore } from "../state/editor-store";
import { useLayoutStore } from "../state/layout-store";
import "./StatusBar.css";

export function StatusBar(): React.ReactElement {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const activeTab = tabs.find((t) => t.path === activePath);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const lang = activeTab ? languageForPath(activeTab.path) : null;

  return (
    <footer className="knox-statusbar">
      <div className="knox-statusbar__left">
        <button className="knox-statusbar__item" onClick={() => setPanelVisible(!panelVisible)}>
          Terminal
        </button>
      </div>
      <div className="knox-statusbar__right">
        {activeTab && (
          <>
            <span className="knox-statusbar__item">
              Ln {activeTab.cursorLine}, Col {activeTab.cursorColumn}
            </span>
            {lang && (
              <span className="knox-statusbar__item" title={lang.intelligence === "full" ? "Full language intelligence" : lang.intelligence === "syntax" ? "Syntax highlighting only" : "Plain text"}>
                {lang.displayName}
              </span>
            )}
            <span className="knox-statusbar__item">{activeTab.dirty ? "● Unsaved" : "✓ Saved"}</span>
          </>
        )}
      </div>
    </footer>
  );
}
