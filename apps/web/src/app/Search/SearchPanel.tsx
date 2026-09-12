import { useMemo } from "react";
import { useSearchStore } from "../../state/search-store";
import { useEditorStore } from "../../state/editor-store";
import "./SearchPanel.css";

export function SearchPanel(): React.ReactElement {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const regex = useSearchStore((s) => s.regex);
  const toggleRegex = useSearchStore((s) => s.toggleRegex);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const toggleCaseSensitive = useSearchStore((s) => s.toggleCaseSensitive);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const openFile = useEditorStore((s) => s.openFile);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const match of results) {
      if (!map.has(match.path)) map.set(match.path, []);
      map.get(match.path)!.push(match);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <div className="knox-search">
      <div className="knox-search__input-row">
        <input
          autoFocus
          className="knox-search__input"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={`knox-search__toggle${caseSensitive ? " active" : ""}`} title="Match case" onClick={toggleCaseSensitive}>
          Aa
        </button>
        <button className={`knox-search__toggle${regex ? " active" : ""}`} title="Use regex" onClick={toggleRegex}>
          .*
        </button>
      </div>

      {loading && <div className="knox-search__status">Searching…</div>}
      {!loading && query && results.length === 0 && <div className="knox-search__status">No results</div>}
      {!loading && results.length > 0 && (
        <div className="knox-search__summary">
          {results.length} result{results.length === 1 ? "" : "s"} in {grouped.length} file{grouped.length === 1 ? "" : "s"}
        </div>
      )}

      <div className="knox-search__results">
        {grouped.map(([path, matches]) => (
          <div key={path} className="knox-search__file">
            <div className="knox-search__file-path">{path}</div>
            {matches.map((m, i) => (
              <button
                key={i}
                className="knox-search__match"
                onClick={() => openFile(path, { preview: true, line: m.line, column: m.column })}
              >
                <span className="knox-search__match-line">{m.line}</span>
                <span className="knox-search__match-text">{m.lineText.trim()}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
