// Single-process sliding-window limiter - enough for one API replica. A multi-replica
// deployment needs a shared store (Redis, already an optional service in docker-compose.yml)
// instead; this is deliberately not that, to avoid a required dependency for the base deploy.
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}

export function pruneRateLimitState(windowMs: number): void {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < windowMs);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}
