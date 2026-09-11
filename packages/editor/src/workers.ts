// Vite's `?worker` import suffix turns each of these into a Worker
// constructor bundled as a separate chunk - Monaco's language services
// (SPEC section 8: "must never run on the main UI thread") each get their
// own worker instead of sharing the UI thread.
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let installed = false;

/** Call once before the first `monaco.editor.create`. Idempotent. */
export function installMonacoWorkers(): void {
  if (installed) return;
  installed = true;
  self.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case "json":
          return new JsonWorker();
        case "css":
        case "scss":
        case "less":
          return new CssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new HtmlWorker();
        case "typescript":
        case "javascript":
          return new TsWorker();
        default:
          return new EditorWorker();
      }
    },
  };
}
