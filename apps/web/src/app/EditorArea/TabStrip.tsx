import { X } from "lucide-react";
import { basename } from "@knox/shared";
import { useEditorStore, type EditorTab } from "../../state/editor-store";
import "./TabStrip.css";

export function TabStrip({ onCloseRequested }: { onCloseRequested: (path: string, tab: EditorTab) => void }): React.ReactElement {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const pinTab = useEditorStore((s) => s.pinTab);

  if (tabs.length === 0) return <div className="knox-tabstrip knox-tabstrip--empty" />;

  return (
    <div className="knox-tabstrip" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          role="tab"
          aria-selected={tab.path === activePath}
          className={`knox-tab${tab.path === activePath ? " knox-tab--active" : ""}${tab.preview ? " knox-tab--preview" : ""}`}
          onClick={() => setActive(tab.path)}
          onDoubleClick={() => pinTab(tab.path)}
          title={tab.path}
        >
          <span className="knox-tab__name">{basename(tab.path)}</span>
          {tab.dirty && <span className="knox-tab__dot" aria-label="Unsaved changes" />}
          <button
            className="knox-tab__close"
            aria-label={`Close ${basename(tab.path)}`}
            onClick={(e) => {
              e.stopPropagation();
              onCloseRequested(tab.path, tab);
            }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
