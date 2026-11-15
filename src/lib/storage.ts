/** Storage access that never throws (private mode, blocked cookies, SSR, tests). */
function safe(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    const storage = globalThis[kind];
    const probe = '__thingdeck_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

export const local = {
  get(key: string) {
    try {
      return safe('localStorage')?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      safe('localStorage')?.setItem(key, value);
    } catch {
      /* ignore quota / access errors */
    }
  },
  remove(key: string) {
    try {
      safe('localStorage')?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const session = {
  get(key: string) {
    try {
      return safe('sessionStorage')?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      safe('sessionStorage')?.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      safe('sessionStorage')?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
