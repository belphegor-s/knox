import { useLayoutStore } from "../state/layout-store";
import type { PanelLayout } from "@knox/shared";
import "./ActivityBar.css";

const ITEMS: { id: PanelLayout["activeActivityView"]; label: string; glyph: string; available: boolean }[] = [
  { id: "explorer", label: "Explorer", glyph: "▤", available: true },
  { id: "search", label: "Search - arrives with the search package", glyph: "⌕", available: false },
  { id: "git", label: "Source Control", glyph: "⑂", available: true },
  { id: "debug", label: "Run & Debug - arrives with the runtime package", glyph: "▷", available: false },
  { id: "extensions", label: "Extensions", glyph: "⬡", available: false },
];

export function ActivityBar(): React.ReactElement {
  const activeView = useLayoutStore((s) => s.activeActivityView);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const setActiveActivityView = useLayoutStore((s) => s.setActiveActivityView);
  const setSidebarVisible = useLayoutStore((s) => s.setSidebarVisible);

  return (
    <nav className="knox-activitybar" aria-label="Primary views">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`knox-activitybar__item${item.id === activeView && sidebarVisible ? " knox-activitybar__item--active" : ""}`}
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.id === activeView && sidebarVisible}
          disabled={!item.available}
          onClick={() => {
            if (item.id === activeView) setSidebarVisible(!sidebarVisible);
            else {
              setActiveActivityView(item.id);
              setSidebarVisible(true);
            }
          }}
        >
          <span aria-hidden>{item.glyph}</span>
        </button>
      ))}
    </nav>
  );
}
