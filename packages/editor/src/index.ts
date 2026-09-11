// Lightweight, monaco-free exports - safe to import eagerly anywhere (used
// by the status bar, file-buffer classification, etc). The Monaco-backed
// component lives at "@knox/editor/monaco" and must only ever be reached via
// dynamic import, so bundlers can keep its ~5MB out of the initial chunk -
// see apps/web/src/app/EditorArea/EditorArea.tsx.
export * from "./languages.js";
export * from "./large-file.js";
