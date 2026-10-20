// Sliding-window limiter for login attempts and emailed links.
// ponytail: in-memory, so it resets on restart and is per-process; fine for one VPS, move to Postgres/Redis if it scales out.

const hits = new Map<string, number[]>();

// Records one attempt for `key`; returns false once `limit` attempts happened within `windowMs`.
export function allow(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function reset(key: string) {
  hits.delete(key);
}
