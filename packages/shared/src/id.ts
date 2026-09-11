/**
 * Dependency-free id generator (avoids pulling nanoid into every package).
 * Not cryptographically significant - used for workspace/session/request ids.
 */
export function createId(prefix?: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return prefix ? `${prefix}_${id}` : id;
}
