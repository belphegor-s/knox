// Mirrors apps/worker/src/languages.ts exactly - apps/api validates before ever forwarding to
// the worker (so a bad request gets a fast, clear 400 instead of a round trip), and this repo's
// apps don't import from one another directly, only from packages/*. Small and stable enough
// (the worker's own runner image is what actually defines "supported") that duplicating it here
// is simpler than standing up a shared package for six language names.
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

export function validateFilename(language: SupportedLanguage, filename: string): string | null {
  if (!REQUIRED_EXTENSION[language].test(filename)) {
    return `${language} requires a file matching ${REQUIRED_EXTENSION[language]}, got "${filename}"`;
  }
  if (filename.includes("/") || filename.includes("..")) {
    return "filename must not contain path separators";
  }
  return null;
}
