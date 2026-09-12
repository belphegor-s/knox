// Languages the sandboxed runner image (infra/runner.Dockerfile) has a real toolchain for.
// JS/TS are deliberately excluded here - they already execute locally in the browser
// (packages/runtime) and don't need a network round-trip or a container.
export const SUPPORTED_LANGUAGES = ["python", "c", "cpp", "java", "go", "rust"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

const REQUIRED_EXTENSION: Record<SupportedLanguage, RegExp> = {
  python: /\.py$/,
  c: /\.c$/,
  cpp: /\.(cpp|cc|cxx)$/,
  java: /\.java$/,
  go: /\.go$/,
  rust: /\.rs$/,
};

/** The runner image dispatches purely on this extension check too - reject early with a clear
 * message instead of letting a mismatched file silently fail deep inside the container. */
export function validateFilename(language: SupportedLanguage, filename: string): string | null {
  if (!REQUIRED_EXTENSION[language].test(filename)) {
    return `${language} requires a file matching ${REQUIRED_EXTENSION[language]}, got "${filename}"`;
  }
  if (filename.includes("/") || filename.includes("..")) {
    return "filename must not contain path separators";
  }
  return null;
}
