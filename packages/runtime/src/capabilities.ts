import type { RuntimeCapabilities } from "@knox/shared";

const LOCAL: RuntimeCapabilities = { language: "", displayName: "", localExecution: true, wasm: false, filesystem: false, network: false, interactive: false };

const UNAVAILABLE = (language: string, displayName: string, reason: string): RuntimeCapabilities => ({
  language,
  displayName,
  localExecution: false,
  wasm: false,
  filesystem: false,
  network: false,
  interactive: false,
  unavailableReason: reason,
});

export const RUNTIME_CAPABILITIES: Record<string, RuntimeCapabilities> = {
  javascript: { ...LOCAL, language: "javascript", displayName: "JavaScript" },
  typescript: { ...LOCAL, language: "typescript", displayName: "TypeScript" },
  python: UNAVAILABLE("python", "Python", "Needs a bundled WASM runtime (Pyodide) - not wired up yet. Use cloud execution once available."),
  rust: UNAVAILABLE("rust", "Rust", "No local WASM toolchain bundled. Requires cloud execution."),
  go: UNAVAILABLE("go", "Go", "No local WASM toolchain bundled. Requires cloud execution."),
  c: UNAVAILABLE("c", "C", "No local WASM toolchain bundled. Requires cloud execution."),
  cpp: UNAVAILABLE("cpp", "C++", "No local WASM toolchain bundled. Requires cloud execution."),
  sql: UNAVAILABLE("sql", "SQL", "No local database engine bundled yet."),
};

export function getCapabilities(language: string): RuntimeCapabilities {
  return RUNTIME_CAPABILITIES[language] ?? UNAVAILABLE(language, language, "No local or cloud runtime configured for this language yet.");
}
