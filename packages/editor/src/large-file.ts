import type * as monaco from "monaco-editor";

// Degrade well before Monaco actually struggles, not after.
export const LARGE_FILE_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB: disable expensive features
export const HUGE_FILE_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB: warn, offer plain-text mode
export const MAX_OPENABLE_BYTES = 100 * 1024 * 1024; // 100MB: refuse, explain why

export type FileSizeTier = "normal" | "large" | "huge" | "too-large";

export function classifyFileSize(bytes: number): FileSizeTier {
  if (bytes > MAX_OPENABLE_BYTES) return "too-large";
  if (bytes > HUGE_FILE_THRESHOLD_BYTES) return "huge";
  if (bytes > LARGE_FILE_THRESHOLD_BYTES) return "large";
  return "normal";
}

export function editorOptionsForSize(bytes: number): monaco.editor.IStandaloneEditorConstructionOptions {
  const tier = classifyFileSize(bytes);
  if (tier === "normal") return {};
  const base: monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    wordWrap: "off",
    folding: false,
    occurrencesHighlight: "off",
    renderWhitespace: "none",
    bracketPairColorization: { enabled: false },
    guides: { indentation: false, bracketPairs: false },
  };
  if (tier === "huge" || tier === "too-large") {
    return {
      ...base,
      quickSuggestions: false,
      parameterHints: { enabled: false },
      hover: { enabled: false },
      links: false,
      renderLineHighlight: "none",
    };
  }
  return base;
}
