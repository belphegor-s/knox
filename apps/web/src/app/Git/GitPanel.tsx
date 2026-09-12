import { useState } from "react";
import { Download, GitBranchPlus, Link2, Minus, Plus, RefreshCw, Undo2, Upload, X } from "lucide-react";
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
            <Minus size={13} strokeWidth={2} />
          </button>
        ) : (
          <>
            <button title="Discard" onClick={() => void discard([`/${file.path}`])}>
              <Undo2 size={13} strokeWidth={1.75} />
            </button>
            <button title="Stage" onClick={() => void stage([file.path])}>
              <Plus size={13} strokeWidth={2} />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function RemoteControls(): React.ReactElement {
  const remote = useGitStore((s) => s.remote);
  const remoteOp = useGitStore((s) => s.remoteOp);
  const setRemote = useGitStore((s) => s.setRemote);
  const clearRemote = useGitStore((s) => s.clearRemote);
  const fetchRemote = useGitStore((s) => s.fetchRemote);
  const pull = useGitStore((s) => s.pull);
  const push = useGitStore((s) => s.push);

  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(remote?.url ?? "");
  const [username, setUsername] = useState(remote?.username ?? "");
  const [token, setToken] = useState(remote?.token ?? "");

  function startEditing(): void {
    setUrl(remote?.url ?? "");
    setUsername(remote?.username ?? "");
    setToken(remote?.token ?? "");
    setEditing(true);
  }

  function save(): void {
    if (!url.trim()) return;
    void setRemote(url.trim(), username.trim(), token.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="knox-git__remote knox-git__remote--editing">
        <input
          autoFocus
          className="knox-tree-input"
          placeholder="https://github.com/user/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
        <input
          className="knox-tree-input"
          placeholder="username (often the account name)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
        <input
          className="knox-tree-input"
          type="password"
          placeholder="personal access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <div className="knox-git__remote-form-actions">
          <button className="knox-btn knox-btn--primary" onClick={save}>
            Save
          </button>
          <button className="knox-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!remote) {
    return (
      <div className="knox-git__remote">
        <button className="knox-git__remote-configure" onClick={startEditing}>
          <Link2 size={13} strokeWidth={1.75} />
          Configure remote
        </button>
      </div>
    );
  }

  return (
    <div className="knox-git__remote">
      <button className="knox-git__remote-url" title="Edit remote" onClick={startEditing}>
        {remote.url}
      </button>
      <span className="knox-git__remote-actions">
        <button title="Fetch" disabled={remoteOp !== null} onClick={() => void fetchRemote()}>
          <RefreshCw size={13} strokeWidth={1.75} className={remoteOp === "fetch" ? "knox-git__spin" : ""} />
        </button>
        <button title="Pull" disabled={remoteOp !== null} onClick={() => void pull()}>
          <Download size={13} strokeWidth={1.75} className={remoteOp === "pull" ? "knox-git__spin" : ""} />
        </button>
        <button title="Push" disabled={remoteOp !== null} onClick={() => void push()}>
          <Upload size={13} strokeWidth={1.75} className={remoteOp === "push" ? "knox-git__spin" : ""} />
        </button>
        <button title="Remove remote" onClick={() => void clearRemote()}>
          <X size={13} strokeWidth={1.75} />
        </button>
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
          <button className="knox-git__new-branch" title="New branch" onClick={() => setNewBranch(true)}>
            <GitBranchPlus size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <RemoteControls />

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
