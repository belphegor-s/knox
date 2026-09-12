/** Pure line-buffer math backing the terminal's readline-style editing - kept separate from
 * view.tsx (which owns xterm/DOM state) so it can be unit tested directly. */

export function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0]!;
  for (const s of strings) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Index of the start of the word immediately before `pos` (Option/Alt+Backspace, Option/Alt+Left). */
export function wordStartBefore(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && /\s/.test(s[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(s[i - 1]!)) i--;
  return i;
}

/** Index just past the end of the word starting at or after `pos` (Option/Alt+Right). */
export function wordEndAfter(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && /\s/.test(s[i]!)) i++;
  while (i < s.length && !/\s/.test(s[i]!)) i++;
  return i;
}
