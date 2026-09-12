import { Suspense, lazy, useEffect, useState } from "react";
import { useWorkspaceStore } from "../../state/workspace-store";
import { getDirectoryHandle } from "../../services/workspace-persistence";

const TerminalView = lazy(() => import("@knox/terminal/view").then((m) => ({ default: m.TerminalView })));

export function TerminalPanel(): React.ReactElement | null {
  const metadata = useWorkspaceStore((s) => s.metadata);
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!metadata) return;
    setReady(false);
    void (async () => {
      if (metadata.fsBackend === "file-system-access") setHandle(await getDirectoryHandle(metadata.id));
      setReady(true);
    })();
  }, [metadata]);

  if (!metadata || !ready) return <div className="knox-bottompanel__empty">Starting terminal…</div>;

  return (
    <Suspense fallback={<div className="knox-bottompanel__empty">Loading terminal…</div>}>
      <TerminalView workspaceId={metadata.id} fsBackend={metadata.fsBackend} directoryHandle={handle} />
    </Suspense>
  );
}
