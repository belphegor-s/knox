import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store";
import { startSessionAutosave, listRecentWorkspaces, openWorkspace } from "../services/workspace-controller";
import { Welcome } from "./Welcome";
import { Shell } from "./Shell";

export function App(): React.ReactElement {
  const phase = useWorkspaceStore((s) => s.phase);
  const metadata = useWorkspaceStore((s) => s.metadata);
  const fs = useWorkspaceStore((s) => s.fs);
  const error = useWorkspaceStore((s) => s.error);
  const [restoreChecked, setRestoreChecked] = useState(false);

  useEffect(() => startSessionAutosave(), []);

  // Restore the previous session automatically (SPEC section 2/6): if a
  // workspace was open before reload/crash, reopen it instead of showing
  // Welcome. File-System-Access-backed workspaces may still fail here since
  // some browsers require a user gesture to re-grant permission - that's a
  // real platform constraint, surfaced honestly via the error state below.
  useEffect(() => {
    let cancelled = false;
    void listRecentWorkspaces().then((recent) => {
      if (cancelled) return;
      const mostRecent = recent[0];
      if (mostRecent) void openWorkspace(mostRecent.id);
      setRestoreChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "ready" && metadata && fs) {
    return <Shell fs={fs} metadata={metadata} />;
  }

  if (phase === "error" && error) {
    return (
      <div className="knox-app-loading knox-app-loading--error" role="alert">
        <p>Couldn't open this workspace.</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!restoreChecked || phase === "loading") {
    return (
      <div className="knox-app-loading" role="status">
        Opening workspace…
      </div>
    );
  }

  return <Welcome />;
}
