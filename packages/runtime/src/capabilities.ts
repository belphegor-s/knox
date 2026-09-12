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
  python: UNAVAILABLE("python", "Python", "No local WASM runtime bundled. Runs via the optional cloud execution service if one is deployed."),
  rust: UNAVAILABLE("rust", "Rust", "No local WASM toolchain bundled. Runs via the optional cloud execution service if one is deployed."),
  go: UNAVAILABLE("go", "Go", "No local WASM toolchain bundled. Runs via the optional cloud execution service if one is deployed."),
  c: UNAVAILABLE("c", "C", "No local WASM toolchain bundled. Runs via the optional cloud execution service if one is deployed."),
  cpp: UNAVAILABLE("cpp", "C++", "No local WASM toolchain bundled. Runs via the optional cloud execution service if one is deployed."),
  java: UNAVAILABLE("java", "Java", "No local WASM toolchain bundled. Runs via the optional cloud execution service if one is deployed."),
  sql: UNAVAILABLE("sql", "SQL", "No local database engine bundled yet."),
};

export function getCapabilities(language: string): RuntimeCapabilities {
  return RUNTIME_CAPABILITIES[language] ?? UNAVAILABLE(language, language, "No local or cloud runtime configured for this language yet.");
}
