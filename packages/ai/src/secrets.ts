export interface SecretMatch {
  name: string;
  index: number;
  length: number;
}

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "GitHub Token", re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: "OpenAI Key", re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: "Private Key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "Database URL", re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s'"]+/g },
  { name: "Generic secret assignment", re: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][A-Za-z0-9\-_.]{16,}['"]/gi },
];

/** Detects common secret shapes before file content ever reaches an AI provider. Default: redact. */
export function detectSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      matches.push({ name, index: m.index, length: m[0].length });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

export function redactSecrets(text: string): { redacted: string; found: string[] } {
  const matches = detectSecrets(text);
  if (matches.length === 0) return { redacted: text, found: [] };
  let out = "";
  let cursor = 0;
  const found = new Set<string>();
  for (const m of matches) {
    if (m.index < cursor) continue; // overlapping match from a different pattern
    out += text.slice(cursor, m.index);
    out += `[REDACTED:${m.name}]`;
    found.add(m.name);
    cursor = m.index + m.length;
  }
  out += text.slice(cursor);
  return { redacted: out, found: [...found] };
}
