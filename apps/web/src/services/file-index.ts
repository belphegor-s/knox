import type { VirtualFileSystem } from "@knox/shared";
import { joinPath } from "@knox/shared";

const DEFAULT_EXCLUDES = new Set(["node_modules", ".git", "dist", "build", ".cache"]);

// Capped recursive scan for Quick Open; stopgap until the indexed search package lands.
export async function listAllFiles(fs: VirtualFileSystem, maxResults = 20_000): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return;
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (DEFAULT_EXCLUDES.has(entry.name)) continue;
      const path = joinPath(dir, entry.name);
      if (entry.type === "directory") {
        await walk(path);
      } else {
        results.push(path);
      }
    }
  }

  await walk("/");
  return results;
}
