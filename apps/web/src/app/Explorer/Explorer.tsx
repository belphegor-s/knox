import { useCallback, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import { dirname, isValidFileName, joinPath, type VirtualFileSystem } from "@knox/shared";
import { useFileTree, type TreeRow } from "./useFileTree";
import { useEditorStore } from "../../state/editor-store";
import { useElementSize } from "../../hooks/useElementSize";
import "./Explorer.css";

const ROW_HEIGHT = 22;

interface PendingCreate {
  parentPath: string;
  type: "file" | "directory";
}

interface ContextMenuState {
  x: number;
  y: number;
  row: TreeRow;
}

export function Explorer({ fs, workspaceName }: { fs: VirtualFileSystem | null; workspaceName: string }): React.ReactElement {
  const { rows, toggle, refresh } = useFileTree(fs);
  const openFile = useEditorStore((s) => s.openFile);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<FixedSizeList>(null);
  const [treeContainerRef, treeSize] = useElementSize<HTMLDivElement>();

  const handleRowClick = useCallback(
    (row: TreeRow, doubleClick: boolean) => {
      setSelected(row.path);
      if (row.type === "directory") {
        toggle(row.path);
      } else {
        openFile(row.path, { preview: !doubleClick });
      }
    },
    [toggle, openFile],
  );

  async function commitCreate(name: string): Promise<void> {
    if (!fs || !pendingCreate || !name) {
      setPendingCreate(null);
      return;
    }
    if (!isValidFileName(name)) {
      setPendingCreate(null);
      return;
    }
    const path = joinPath(pendingCreate.parentPath, name);
    try {
      if (pendingCreate.type === "file") {
        await fs.writeFile(path, "");
        openFile(path, { preview: false });
      } else {
        await fs.mkdir(path);
      }
      refresh(pendingCreate.parentPath);
    } finally {
      setPendingCreate(null);
    }
  }

  async function commitRename(row: TreeRow, name: string): Promise<void> {
    setRenaming(null);
    if (!fs || !name || name === row.name || !isValidFileName(name)) return;
    const newPath = joinPath(dirname(row.path), name);
    await fs.rename(row.path, newPath);
    refresh(dirname(row.path));
  }

  async function handleDelete(row: TreeRow): Promise<void> {
    if (!fs) return;
    setContextMenu(null);
    await fs.delete(row.path, { recursive: true });
    refresh(dirname(row.path));
  }

  const displayRows: (TreeRow | { synthetic: true; parentPath: string; type: "file" | "directory"; depth: number })[] = [...rows];
  if (pendingCreate) {
    const parentDepth = pendingCreate.parentPath === "/" ? 0 : rows.find((r) => r.path === pendingCreate.parentPath)?.depth ?? -1;
    const insertAt = pendingCreate.parentPath === "/" ? 0 : rows.findIndex((r) => r.path === pendingCreate.parentPath) + 1;
    displayRows.splice(insertAt, 0, {
      synthetic: true,
      parentPath: pendingCreate.parentPath,
      type: pendingCreate.type,
      depth: parentDepth + 1,
    });
  }

  function Row({ index, style }: ListChildComponentProps): React.ReactElement {
    const row = displayRows[index]!;
    if ("synthetic" in row) {
      return (
        <div style={style} className="knox-tree-row knox-tree-row--input" data-depth={row.depth}>
          <span style={{ width: row.depth * 14 }} />
          <input
            autoFocus
            className="knox-tree-input"
            placeholder={row.type === "file" ? "file-name.ts" : "folder-name"}
            onBlur={(e) => void commitCreate(e.currentTarget.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate((e.target as HTMLInputElement).value.trim());
              if (e.key === "Escape") setPendingCreate(null);
            }}
          />
        </div>
      );
    }
    const isRenaming = renaming === row.path;
    return (
      <div
        style={style}
        className={`knox-tree-row${selected === row.path ? " knox-tree-row--selected" : ""}`}
        onClick={() => handleRowClick(row, false)}
        onDoubleClick={() => handleRowClick(row, true)}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelected(row.path);
          setContextMenu({ x: e.clientX, y: e.clientY, row });
        }}
      >
        <span style={{ width: row.depth * 14 }} />
        {row.type === "directory" ? (
          <ChevronRight
            size={14}
            strokeWidth={2}
            className={`knox-tree-chevron${row.expanded ? " knox-tree-chevron--open" : ""}`}
          />
        ) : (
          <span className="knox-tree-chevron" />
        )}
        <span className="knox-tree-icon" aria-hidden>
          {row.type === "directory" ? (
            row.expanded ? (
              <FolderOpen size={14} strokeWidth={1.75} />
            ) : (
              <Folder size={14} strokeWidth={1.75} />
            )
          ) : (
            <File size={14} strokeWidth={1.75} />
          )}
        </span>
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={row.name}
            className="knox-tree-input"
            onBlur={(e) => void commitRename(row, e.currentTarget.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename(row, (e.target as HTMLInputElement).value.trim());
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <span className="knox-tree-name">{row.name}</span>
        )}
        {row.loading && <span className="knox-tree-spinner" />}
      </div>
    );
  }

  return (
    <div className="knox-explorer" onClick={() => setContextMenu(null)}>
      <div className="knox-explorer__header">
        <span className="knox-explorer__title">{workspaceName}</span>
        <div className="knox-explorer__actions">
          <button title="New File" aria-label="New File" onClick={() => setPendingCreate({ parentPath: "/", type: "file" })}>
            <FilePlus size={15} strokeWidth={1.75} />
          </button>
          <button title="New Folder" aria-label="New Folder" onClick={() => setPendingCreate({ parentPath: "/", type: "directory" })}>
            <FolderPlus size={15} strokeWidth={1.75} />
          </button>
          <button title="Refresh" aria-label="Refresh" onClick={() => refresh("/")}>
            <RefreshCw size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="knox-explorer__tree" ref={treeContainerRef}>
        {treeSize.height > 0 && (
          <FixedSizeList
            ref={listRef}
            height={treeSize.height}
            width={treeSize.width}
            itemCount={displayRows.length}
            itemSize={ROW_HEIGHT}
            className="knox-explorer__list"
          >
            {Row}
          </FixedSizeList>
        )}
      </div>

      {contextMenu && (
        <div
          className="knox-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.row.type === "directory" && (
            <>
              <button
                onClick={() => {
                  setPendingCreate({ parentPath: contextMenu.row.path, type: "file" });
                  setContextMenu(null);
                }}
              >
                New File
              </button>
              <button
                onClick={() => {
                  setPendingCreate({ parentPath: contextMenu.row.path, type: "directory" });
                  setContextMenu(null);
                }}
              >
                New Folder
              </button>
              <div className="knox-context-menu__sep" />
            </>
          )}
          <button
            onClick={() => {
              setRenaming(contextMenu.row.path);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button className="knox-context-menu__danger" onClick={() => void handleDelete(contextMenu.row)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
