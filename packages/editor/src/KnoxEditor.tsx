import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as monaco from "monaco-editor";
import type { EditorSelection } from "@knox/shared";
import { installMonacoWorkers } from "./workers.js";
import { defineKnoxThemes } from "./theme.js";
import { modelRegistry } from "./model-registry.js";
import { editorOptionsForSize } from "./large-file.js";

installMonacoWorkers();
defineKnoxThemes();

export interface KnoxEditorHandle {
  focus(): void;
  formatDocument(): void;
  markSaved(): void;
  getEditor(): monaco.editor.IStandaloneCodeEditor | null;
}

export interface KnoxEditorProps {
  path: string;
  initialValue: string;
  fileSizeBytes: number;
  theme?: "knox-dark" | "knox-light";
  readOnly?: boolean;
  initialViewState?: { line: number; column: number; scrollTop: number } | null;
  onChange?: (value: string, isDirty: boolean) => void;
  onCursorChange?: (line: number, column: number, selections: EditorSelection[], scrollTop: number) => void;
  onSaveRequested?: () => void;
}

// Imperative, not controlled: Monaco owns the buffer, keeping keystrokes off React's render cycle.
export const KnoxEditor = forwardRef<KnoxEditorHandle, KnoxEditorProps>(function KnoxEditor(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    formatDocument: () => {
      void editorRef.current?.getAction("editor.action.formatDocument")?.run();
    },
    markSaved: () => modelRegistry.markSaved(propsRef.current.path),
    getEditor: () => editorRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      theme: props.theme ?? "knox-dark",
      fontFamily: 'ui-monospace, "JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: true,
      cursorBlinking: "smooth",
      smoothScrolling: true,
      padding: { top: 8, bottom: 8 },
      scrollBeyondLastLine: false,
      readOnly: props.readOnly,
      ...editorOptionsForSize(props.fileSizeBytes),
    });
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      propsRef.current.onSaveRequested?.();
    });

    const cursorSub = editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      const selections = (editor.getSelections() ?? []).map(
        (s): EditorSelection => ({
          startLine: s.startLineNumber,
          startColumn: s.startColumn,
          endLine: s.endLineNumber,
          endColumn: s.endColumn,
        }),
      );
      propsRef.current.onCursorChange?.(pos.lineNumber, pos.column, selections, editor.getScrollTop());
    });

    return () => {
      cursorSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor is created once; path swaps handled below
  }, []);

  // swap model on path change; registry caches it so undo history survives tab switches
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = modelRegistry.get(props.path, props.initialValue);
    editor.setModel(model);

    if (props.initialViewState) {
      editor.setPosition({ lineNumber: props.initialViewState.line, column: props.initialViewState.column });
      editor.setScrollTop(props.initialViewState.scrollTop);
    }
    editor.focus();

    const changeSub = model.onDidChangeContent(() => {
      propsRef.current.onChange?.(model.getValue(), modelRegistry.isDirty(props.path));
    });
    return () => changeSub.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path]);

  useEffect(() => {
    if (editorRef.current) monaco.editor.setTheme(props.theme ?? "knox-dark");
  }, [props.theme]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export function getModelValue(path: string): string | null {
  return modelRegistry.getValue(path);
}

export function disposeModel(path: string): void {
  modelRegistry.release(path);
}

export function isModelDirty(path: string): boolean {
  return modelRegistry.isDirty(path);
}
