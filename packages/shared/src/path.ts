// POSIX-style paths only; never use Node's `path` module here.
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const isAbsolute = path.startsWith("/");
  const segments = path.split("/").filter((s) => s.length > 0 && s !== ".");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbsolute) out.push(seg);
    } else {
      out.push(seg);
    }
  }
  return (isAbsolute ? "/" : "") + out.join("/");
}

export function joinPath(...segments: string[]): string {
  return normalizePath(segments.join("/"));
}

export function dirname(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx);
}

export function basename(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
}

export function isValidFileName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  if (/[<>:"|?*\x00-\x1f]/.test(name)) return false;
  if (name.endsWith(" ") || name.endsWith(".")) return false;
  return true;
}

export function relative(from: string, to: string): string {
  const fromParts = normalizePath(from).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  return [...Array(up).fill(".."), ...toParts.slice(i)].join("/") || ".";
}
