/** Fixed-window limiter for login/registration attempts, keyed by IP + email. */
export function createLimiter({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number;
  windowMs: number;
  now?: () => number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Returns seconds to wait if the key is over the limit, otherwise 0. */
    check(key: string) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now()) return 0;
      return entry.count >= max ? Math.ceil((entry.resetAt - now()) / 1000) : 0;
    },
    fail(key: string) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now()) hits.set(key, { count: 1, resetAt: now() + windowMs });
      else entry.count += 1;
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now()) hits.delete(k);
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
