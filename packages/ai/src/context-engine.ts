import { redactSecrets } from "./secrets.js";

export interface AiContextFile {
  path: string;
  content: string;
  reason: string;
  redacted: boolean;
}

export interface AiContext {
  files: AiContextFile[];
  estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BuildContextInput {
  currentFile?: { path: string; content: string };
  selection?: string;
  terminalError?: string;
}

/**
 * Builds the smallest useful context for a request - today just the current
 * file/selection (+ redaction), never the whole repo. SPEC section 19's fuller
 * pipeline (imports, referenced symbols, nearby files, repo structure, git
 * history, diagnostics, semantic search) isn't built yet - documented as a
 * roadmap gap, not silently approximated.
 */
export function buildContext(input: BuildContextInput): AiContext {
  const files: AiContextFile[] = [];

  if (input.currentFile) {
    const raw = input.selection || input.currentFile.content;
    const { redacted, found } = redactSecrets(raw);
    files.push({
      path: input.currentFile.path,
      content: redacted,
      reason: input.selection ? "current selection" : "current file",
      redacted: found.length > 0,
    });
  }

  if (input.terminalError) {
    const { redacted, found } = redactSecrets(input.terminalError);
    files.push({ path: "(terminal output)", content: redacted, reason: "recent command failure", redacted: found.length > 0 });
  }

  const estimatedTokens = files.reduce((sum, f) => sum + estimateTokens(f.content), 0);
  return { files, estimatedTokens };
}
