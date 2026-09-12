// "full" = real language service; "syntax" = highlighting only; "none" = plain text.
export type IntelligenceLevel = "full" | "syntax" | "none";

export interface LanguageDescriptor {
  id: string;
  displayName: string;
  intelligence: IntelligenceLevel;
}

const EXTENSION_MAP: Record<string, LanguageDescriptor> = {
  ts: { id: "typescript", displayName: "TypeScript", intelligence: "full" },
  tsx: { id: "typescript", displayName: "TypeScript React", intelligence: "full" },
  mts: { id: "typescript", displayName: "TypeScript", intelligence: "full" },
  js: { id: "javascript", displayName: "JavaScript", intelligence: "full" },
  jsx: { id: "javascript", displayName: "JavaScript React", intelligence: "full" },
  mjs: { id: "javascript", displayName: "JavaScript", intelligence: "full" },
  cjs: { id: "javascript", displayName: "JavaScript", intelligence: "full" },
  json: { id: "json", displayName: "JSON", intelligence: "full" },
  jsonc: { id: "json", displayName: "JSON with Comments", intelligence: "full" },
  html: { id: "html", displayName: "HTML", intelligence: "full" },
  htm: { id: "html", displayName: "HTML", intelligence: "full" },
  css: { id: "css", displayName: "CSS", intelligence: "full" },
  scss: { id: "scss", displayName: "SCSS", intelligence: "full" },
  less: { id: "less", displayName: "LESS", intelligence: "full" },
  md: { id: "markdown", displayName: "Markdown", intelligence: "syntax" },
  mdx: { id: "markdown", displayName: "MDX", intelligence: "syntax" },
  py: { id: "python", displayName: "Python", intelligence: "syntax" },
  rs: { id: "rust", displayName: "Rust", intelligence: "syntax" },
  go: { id: "go", displayName: "Go", intelligence: "syntax" },
  c: { id: "c", displayName: "C", intelligence: "syntax" },
  h: { id: "c", displayName: "C Header", intelligence: "syntax" },
  cpp: { id: "cpp", displayName: "C++", intelligence: "syntax" },
  cc: { id: "cpp", displayName: "C++", intelligence: "syntax" },
  hpp: { id: "cpp", displayName: "C++ Header", intelligence: "syntax" },
  cs: { id: "csharp", displayName: "C#", intelligence: "syntax" },
  java: { id: "java", displayName: "Java", intelligence: "syntax" },
  rb: { id: "ruby", displayName: "Ruby", intelligence: "syntax" },
  php: { id: "php", displayName: "PHP", intelligence: "syntax" },
  sql: { id: "sql", displayName: "SQL", intelligence: "syntax" },
  sh: { id: "shell", displayName: "Shell", intelligence: "syntax" },
  bash: { id: "shell", displayName: "Shell", intelligence: "syntax" },
  yaml: { id: "yaml", displayName: "YAML", intelligence: "syntax" },
  yml: { id: "yaml", displayName: "YAML", intelligence: "syntax" },
  toml: { id: "ini", displayName: "TOML", intelligence: "syntax" },
  xml: { id: "xml", displayName: "XML", intelligence: "syntax" },
  svg: { id: "xml", displayName: "SVG", intelligence: "syntax" },
  txt: { id: "plaintext", displayName: "Plain Text", intelligence: "none" },
};

const DEFAULT_LANGUAGE: LanguageDescriptor = { id: "plaintext", displayName: "Plain Text", intelligence: "none" };

export function languageForPath(path: string): LanguageDescriptor {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? DEFAULT_LANGUAGE;
}
