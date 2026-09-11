import { useEffect, useState } from "react";
import type { WorkspaceMetadata } from "@knox/shared";
import { FileSystemAccessBackend } from "@knox/filesystem";
import {
  createWorkspace,
  createWorkspaceFromDirectory,
  listRecentWorkspaces,
  openWorkspace,
  deleteWorkspace,
} from "../services/workspace-controller";
import "./Welcome.css";

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function Welcome(): React.ReactElement {
  const [recent, setRecent] = useState<WorkspaceMetadata[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fsaSupported = FileSystemAccessBackend.isSupported();

  useEffect(() => {
    let cancelled = false;
    void listRecentWorkspaces().then((list) => {
      if (!cancelled) setRecent(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNewProject(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      await createWorkspace(`New Project ${new Date().toLocaleDateString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenFolder(): Promise<void> {
    setError(null);
    try {
      await createWorkspaceFromDirectory();
    } catch (err) {
      // The picker throws AbortError when the user simply cancels - not a real error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    await deleteWorkspace(id);
    setRecent((prev) => prev?.filter((w) => w.id !== id) ?? null);
  }

  return (
    <div className="knox-welcome">
      <div className="knox-welcome__inner">
        <div className="knox-welcome__mark">Knox</div>
        <p className="knox-welcome__tagline">Your code stays on your device by default.</p>

        {error && <div className="knox-welcome__error">{error}</div>}

        <div className="knox-welcome__actions">
          <button className="knox-btn knox-btn--primary" onClick={handleNewProject} disabled={creating}>
            {creating ? "Creating…" : "New project"}
          </button>
          <button
            className="knox-btn"
            disabled={!fsaSupported}
            title={fsaSupported ? "Open a folder from your device" : "Your browser does not support the File System Access API - using the local virtual filesystem instead"}
            onClick={() => void handleOpenFolder()}
          >
            Open folder
          </button>
          <button className="knox-btn" disabled title="Requires the Git package - arriving in a follow-up build">
            Clone repository
          </button>
        </div>

        {recent && recent.length > 0 && (
          <div className="knox-welcome__recent">
            <div className="knox-welcome__recent-label">Recent</div>
            <ul className="knox-welcome__list">
              {recent.map((ws) => (
                <li key={ws.id}>
                  <button className="knox-welcome__item" onClick={() => void openWorkspace(ws.id)}>
                    <span className="knox-welcome__item-name">{ws.name}</span>
                    <span className="knox-welcome__item-meta">{formatRelativeTime(ws.lastOpenedAt)}</span>
                    <span
                      className="knox-welcome__item-delete"
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${ws.name}`}
                      onClick={(e) => void handleDelete(ws.id, e)}
                      onKeyDown={(e) => e.key === "Enter" && void handleDelete(ws.id, e as unknown as React.MouseEvent)}
                    >
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
