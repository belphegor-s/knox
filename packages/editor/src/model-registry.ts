import * as monaco from "monaco-editor";
import { languageForPath } from "./languages.js";

/**
 * One Monaco text model per open path, reused across tab switches so undo
 * history and view state survive switching away and back - recreating the
 * model on every tab click is a common cause of "editor feels laggy".
 *
 * Also tracks each model's "saved" version marker (Monaco's alternative
 * version id) so dirty state is computed from Monaco's own undo stack
 * rather than string-diffing buffers on every keystroke.
 */
class ModelRegistry {
  private readonly models = new Map<string, monaco.editor.ITextModel>();
  private readonly savedVersion = new Map<string, number>();

  get(path: string, initialValue: string): monaco.editor.ITextModel {
    const existing = this.models.get(path);
    if (existing && !existing.isDisposed()) return existing;
    const uri = monaco.Uri.from({ scheme: "knox", path });
    const model = monaco.editor.createModel(initialValue, languageForPath(path).id, uri);
    this.models.set(path, model);
    this.savedVersion.set(path, model.getAlternativeVersionId());
    return model;
  }

  has(path: string): boolean {
    const m = this.models.get(path);
    return !!m && !m.isDisposed();
  }

  isDirty(path: string): boolean {
    const model = this.models.get(path);
    if (!model || model.isDisposed()) return false;
    return model.getAlternativeVersionId() !== this.savedVersion.get(path);
  }

  markSaved(path: string): void {
    const model = this.models.get(path);
    if (model) this.savedVersion.set(path, model.getAlternativeVersionId());
  }

  getValue(path: string): string | null {
    const model = this.models.get(path);
    return model && !model.isDisposed() ? model.getValue() : null;
  }

  release(path: string): void {
    const model = this.models.get(path);
    if (model) {
      model.dispose();
      this.models.delete(path);
      this.savedVersion.delete(path);
    }
  }

  releaseAll(): void {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
    this.savedVersion.clear();
  }
}

export const modelRegistry = new ModelRegistry();
