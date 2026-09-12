import * as monaco from "monaco-editor";
import { languageForPath } from "./languages.js";

// One Monaco model per path (reused across tab switches); dirty state via Monaco's own version id, not string diffing.
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
