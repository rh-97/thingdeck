import { ApiError } from '@/api/client';
import type { SyncedPreferences } from '@/store/settings';

export interface Account {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export type LiveStatus =
  | { connected: false; status: 'missing' }
  | { connected: true; status: 'valid' | 'expired' | 'unknown'; savedAt: string; likelyExpiresAt: string };

export interface Me {
  user: Account;
  preferences: Partial<SyncedPreferences>;
  live: LiveStatus;
}

const base = () => `${(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')}/api`;

/** JSON fetch against the ThingsDeck server, with typed errors. */
export async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'thingsdeck',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    throw new ApiError(0, path, cause instanceof Error ? cause.message : 'Network error');
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string } } | undefined)?.error;
    throw new ApiError(response.status, path, error?.message ?? response.statusText, error?.code);
  }
  return data as T;
}

export const authApi = {
  config: () => apiFetch<{ signup: 'open' | 'closed' }>('GET', '/auth/config'),
  me: () => apiFetch<Me>('GET', '/me'),
  register: (body: { email: string; password: string; name: string }) =>
    apiFetch<{ user: Account }>('POST', '/auth/register', body),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ user: Account }>('POST', '/auth/login', body),
  logout: () => apiFetch<{ ok: true }>('POST', '/auth/logout'),
  savePreferences: (prefs: Partial<SyncedPreferences>) =>
    apiFetch<{ preferences: Partial<SyncedPreferences> }>('PUT', '/me/preferences', prefs),
  saveToken: (token: string) => apiFetch<{ live: LiveStatus }>('PUT', '/me/token', { token }),
  deleteToken: () => apiFetch<{ ok: true }>('DELETE', '/me/token'),
  changePassword: (current: string, next: string) =>
    apiFetch<{ ok: true }>('PUT', '/me/password', { current, next }),
  deleteAccount: (password: string) => apiFetch<{ ok: true }>('DELETE', '/me', { password }),
};
