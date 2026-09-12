import { useState } from "react";
import { useGitStore } from "../../state/git-store";
import type { GitFileStatus } from "@knox/git";
import "./GitPanel.css";

const STATUS_LABEL: Record<GitFileStatus["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "U",
  unmodified: "",
  unmerged: "!",
};

function FileRow({ file }: { file: GitFileStatus }): React.ReactElement {
  const stage = useGitStore((s) => s.stage);
  const unstage = useGitStore((s) => s.unstage);
  const discard = useGitStore((s) => s.discard);
  const openDiff = useGitStore((s) => s.openDiff);

  return (
    <div className="knox-git-row" onClick={() => void openDiff(`/${file.path}`)}>
      <span className={`knox-git-row__status knox-git-row__status--${file.status}`}>{STATUS_LABEL[file.status]}</span>
      <span className="knox-git-row__path">{file.path}</span>
      <span className="knox-git-row__actions" onClick={(e) => e.stopPropagation()}>
        {file.staged ? (
          <button title="Unstage" onClick={() => void unstage([file.path])}>
            −
          </button>
        ) : (
          <>
            <button title="Discard" onClick={() => void discard([`/${file.path}`])}>
              ↺
            </button>
            <button title="Stage" onClick={() => void stage([file.path])}>
              +
            </button>
          </>
        )}
      </span>
    </div>
  );
}

export function GitPanel(): React.ReactElement {
  const isRepo = useGitStore((s) => s.isRepo);
  const loading = useGitStore((s) => s.loading);
  const status = useGitStore((s) => s.status);
  const branches = useGitStore((s) => s.branches);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const log = useGitStore((s) => s.log);
  const error = useGitStore((s) => s.error);
  const initRepo = useGitStore((s) => s.initRepo);
  const commit = useGitStore((s) => s.commit);
  const checkout = useGitStore((s) => s.checkout);
  const createBranch = useGitStore((s) => s.createBranch);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState(false);

  if (loading) return <div className="knox-git-empty">Loading…</div>;

  if (!isRepo) {
    return (
      <div className="knox-git-empty">
        <p>This folder isn't a Git repository.</p>
        {error && <p className="knox-git-empty__error">{error}</p>}
        <button className="knox-btn knox-btn--primary" onClick={() => void initRepo()}>
          Initialize Repository
        </button>
      </div>
    );
  }

  const staged = status.filter((f) => f.staged);
  const unstaged = status.filter((f) => !f.staged);

  return (
    <div className="knox-git">
      {error && <div className="knox-git-empty__error">{error}</div>}
      <div className="knox-git__branch">
        <select value={currentBranch ?? ""} onChange={(e) => void checkout(e.target.value)}>
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        {newBranch ? (
          <input
            autoFocus
            className="knox-tree-input"
            placeholder="branch-name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void createBranch((e.target as HTMLInputElement).value.trim());
                setNewBranch(false);
              }
              if (e.key === "Escape") setNewBranch(false);
            }}
            onBlur={() => setNewBranch(false)}
          />
        ) : (
          <button title="New branch" onClick={() => setNewBranch(true)}>
            +
          </button>
        )}
      </div>

      <textarea
        className="knox-git__message"
        placeholder="Commit message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        className="knox-btn knox-btn--primary knox-git__commit"
        disabled={staged.length === 0 || !message.trim()}
        onClick={() => {
          void commit(message.trim());
          setMessage("");
        }}
      >
        Commit {staged.length > 0 ? `(${staged.length})` : ""}
      </button>

      <div className="knox-git__section">
        <div className="knox-git__section-label">Staged ({staged.length})</div>
        {staged.map((f) => (
          <FileRow key={f.path} file={f} />
        ))}
      </div>
      <div className="knox-git__section">
        <div className="knox-git__section-label">Changes ({unstaged.length})</div>
        {unstaged.map((f) => (
          <FileRow key={f.path} file={f} />
        ))}
        {status.length === 0 && <div className="knox-git-empty knox-git-empty--inline">No changes.</div>}
      </div>

      <div className="knox-git__section knox-git__section--history">
        <div className="knox-git__section-label">History</div>
        {log.map((c) => (
          <div key={c.oid} className="knox-git-commit">
            <span className="knox-git-commit__message">{c.message}</span>
            <span className="knox-git-commit__meta">
              {c.author} · {c.oid.slice(0, 7)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
