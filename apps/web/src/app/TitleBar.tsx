import type { WorkspaceMetadata } from "@knox/shared";
import "./TitleBar.css";

const BACKEND_LABEL: Record<WorkspaceMetadata["fsBackend"], string> = {
  opfs: "Local (OPFS)",
  indexeddb: "Local (IndexedDB)",
  "file-system-access": "Local folder",
};

export function TitleBar({ metadata }: { metadata: WorkspaceMetadata }): React.ReactElement {
  return (
    <header className="knox-titlebar">
      <div className="knox-titlebar__left">
        <span className="knox-titlebar__mark">Knox</span>
        <span className="knox-titlebar__sep">/</span>
        <span className="knox-titlebar__project">{metadata.name}</span>
      </div>
      <div className="knox-titlebar__right">
        <span className="knox-titlebar__backend" title="Where this workspace's files are stored">
          {BACKEND_LABEL[metadata.fsBackend]}
        </span>
      </div>
    </header>
  );
}
