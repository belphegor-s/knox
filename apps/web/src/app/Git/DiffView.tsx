import { useGitStore } from "../../state/git-store";
import "./DiffView.css";

export function DiffView(): React.ReactElement {
  const path = useGitStore((s) => s.viewingDiff);
  const hunks = useGitStore((s) => s.diffHunks);
  const closeDiff = useGitStore((s) => s.closeDiff);

  return (
    <div className="knox-diffview">
      <div className="knox-diffview__header">
        <span className="knox-diffview__path">{path}</span>
        <button onClick={closeDiff}>Close diff</button>
      </div>
      <div className="knox-diffview__body">
        {hunks.length === 0 && <div className="knox-diffview__empty">No changes to show.</div>}
        {hunks.map((hunk, i) =>
          hunk.lines.map((line, j) => (
            <div key={`${i}-${j}`} className={`knox-diffview__line knox-diffview__line--${hunk.type}`}>
              <span className="knox-diffview__gutter">{hunk.type === "add" ? "+" : hunk.type === "remove" ? "-" : " "}</span>
              <span>{line}</span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
