import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import type { KnoxEditorHandle } from "@knox/editor/monaco";
import { useEditorStore, type EditorTab } from "../../state/editor-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { useFileBuffer } from "./useFileBuffer";
import { TabStrip } from "./TabStrip";
import "./EditorArea.css";

// Monaco is ~5MB - keep it out of the initial bundle (SPEC section 61: lazy-load, don't init everything at startup).
// This is the *only* place "@knox/editor/monaco" may be imported statically-adjacent;
// everywhere else must use the lightweight "@knox/editor" entry point.
const KnoxEditor = lazy(() => import("@knox/editor/monaco").then((m) => ({ default: m.KnoxEditor })));

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ImagePreview({ bytes, path }: { bytes: Uint8Array | null; path: string }): React.ReactElement {
  const url = useMemo(() => URL.createObjectURL(new Blob([(bytes ?? new Uint8Array()) as unknown as BlobPart])), [bytes]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="knox-editor-image">
      <img src={url} alt={path} />
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="knox-editor-empty">
      <div className="knox-editor-empty__mark">Knox</div>
      <p>Select a file from the explorer, or press ⌘P to quick-open one.</p>
    </div>
  );
}

function SingleFilePane({ tab }: { tab: EditorTab }): React.ReactElement {
  const fs = useWorkspaceStore((s) => s.fs);
  const buffer = useFileBuffer(fs, tab.path);
  const setDirty = useEditorStore((s) => s.setDirty);
  const pinTab = useEditorStore((s) => s.pinTab);
  const updateCursor = useEditorStore((s) => s.updateCursor);
  const editorHandle = useRef<KnoxEditorHandle>(null);

  async function save(): Promise<void> {
    if (!fs || buffer.kind !== "text") return;
    const editor = editorHandle.current?.getEditor();
    const value = editor?.getModel()?.getValue();
    if (value === undefined) return;
    await fs.writeFile(tab.path, value);
    editorHandle.current?.markSaved();
    setDirty(tab.path, false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.path, buffer.kind]);

  if (buffer.status === "loading") {
    return <div className="knox-editor-status">Loading…</div>;
  }
  if (buffer.status === "error") {
    return (
      <div className="knox-editor-status knox-editor-status--error">
        <p>Couldn't open {tab.path}.</p>
        <p className="knox-editor-status__detail">{buffer.error}</p>
      </div>
    );
  }
  if (buffer.kind === "too-large") {
    return (
      <div className="knox-editor-status">
        <p>This file is {formatBytes(buffer.sizeBytes)} - too large to open safely in the browser editor.</p>
        <p className="knox-editor-status__detail">Files over 100MB are blocked to avoid freezing the tab.</p>
      </div>
    );
  }
  if (buffer.kind === "image") {
    return <ImagePreview bytes={buffer.bytes} path={tab.path} />;
  }
  if (buffer.kind === "binary") {
    return (
      <div className="knox-editor-status">
        <p>This file appears to be binary.</p>
        <p className="knox-editor-status__detail">{formatBytes(buffer.sizeBytes)} · no text preview available</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="knox-editor-status">Loading editor…</div>}>
      <KnoxEditor
        ref={editorHandle}
        path={tab.path}
        initialValue={buffer.text}
        fileSizeBytes={buffer.sizeBytes}
        initialViewState={
          tab.cursorLine > 1 || tab.cursorColumn > 1
            ? { line: tab.cursorLine, column: tab.cursorColumn, scrollTop: tab.scrollTop }
            : null
        }
        onChange={(_value, dirty) => {
          setDirty(tab.path, dirty);
          if (dirty && tab.preview) pinTab(tab.path);
        }}
        onCursorChange={(line, column, selections, scrollTop) => updateCursor(tab.path, line, column, selections, scrollTop)}
        onSaveRequested={() => void save()}
      />
    </Suspense>
  );
}

export function EditorArea(): React.ReactElement {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const closeTab = useEditorStore((s) => s.closeTab);
  const activeTab = tabs.find((t) => t.path === activePath) ?? null;

  function handleClose(path: string, tab: EditorTab): void {
    if (tab.dirty) {
      const ok = window.confirm(`"${path.split("/").pop()}" has unsaved changes. Close anyway?`);
      if (!ok) return;
    }
    closeTab(path);
  }

  return (
    <div className="knox-editor-area">
      <TabStrip onCloseRequested={handleClose} />
      <div className="knox-editor-area__content">
        {activeTab ? <SingleFilePane key={activeTab.path} tab={activeTab} /> : <EmptyState />}
      </div>
    </div>
  );
}
