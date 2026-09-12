import { Files, Search, GitBranch, Bug, Blocks } from "lucide-react";
import { useLayoutStore } from "../state/layout-store";
import type { PanelLayout } from "@knox/shared";
import "./ActivityBar.css";

const ITEMS: { id: PanelLayout["activeActivityView"]; label: string; icon: typeof Files; available: boolean }[] = [
  { id: "explorer", label: "Explorer", icon: Files, available: true },
  { id: "search", label: "Search", icon: Search, available: true },
  { id: "git", label: "Source Control", icon: GitBranch, available: true },
  { id: "debug", label: "Run & Debug - arrives with the runtime package", icon: Bug, available: false },
  { id: "extensions", label: "Extensions", icon: Blocks, available: false },
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
          <item.icon size={19} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </nav>
  );
}
