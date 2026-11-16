import { DatabaseSync } from 'node:sqlite';
import type { Sealed } from './crypto.ts';

export interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: number;
}

export type TokenStatus = 'valid' | 'expired' | 'unknown';

export interface StoredToken extends Sealed {
  user_id: number;
  saved_at: number;
  status: TokenStatus;
  checked_at: number;
}

export type Db = ReturnType<typeof openDb>;

/** Opens (or creates) the SQLite database and returns a tiny typed repository. */
export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      checked_at INTEGER NOT NULL
    );
  `);

  return {
    raw: db,
    createUser(email: string, name: string, passwordHash: string, now: number): User {
      const result = db
        .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, passwordHash, now);
      return this.userById(Number(result.lastInsertRowid))!;
    },
    userByEmail(email: string) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
    },
    userById(id: number) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    },
    updatePassword(id: number, hash: string) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    },
    deleteUser(id: number) {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    },

    createSession(idHash: string, userId: number, now: number, expiresAt: number) {
      db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
        idHash,
        userId,
        now,
        expiresAt,
      );
    },
    sessionUser(idHash: string, now: number) {
      return db
        .prepare(
          'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id_hash = ? AND sessions.expires_at > ?',
        )
        .get(idHash, now) as User | undefined;
    },
    touchSession(idHash: string, expiresAt: number) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').run(expiresAt, idHash);
    },
    deleteSession(idHash: string) {
      db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
    },
    deleteSessionsFor(userId: number, exceptHash?: string) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(userId, exceptHash ?? '');
    },
    purgeExpiredSessions(now: number) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    },

    preferences(userId: number): Record<string, unknown> {
      const row = db.prepare('SELECT json FROM preferences WHERE user_id = ?').get(userId) as
        { json: string } | undefined;
      return row ? (JSON.parse(row.json) as Record<string, unknown>) : {};
    },
    savePreferences(userId: number, prefs: Record<string, unknown>, now: number) {
      db.prepare(
        'INSERT INTO preferences (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
      ).run(userId, JSON.stringify(prefs), now);
    },

    token(userId: number) {
      return db.prepare('SELECT * FROM tokens WHERE user_id = ?').get(userId) as StoredToken | undefined;
    },
    saveToken(userId: number, sealed: Sealed, now: number) {
      db.prepare(
        `INSERT INTO tokens (user_id, ciphertext, iv, tag, saved_at, status, checked_at) VALUES (?, ?, ?, ?, ?, 'valid', ?)
         ON CONFLICT(user_id) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag,
           saved_at = excluded.saved_at, status = 'valid', checked_at = excluded.checked_at`,
      ).run(userId, sealed.ciphertext, sealed.iv, sealed.tag, now, now);
    },
    setTokenStatus(userId: number, status: TokenStatus, now: number) {
      db.prepare('UPDATE tokens SET status = ?, checked_at = ? WHERE user_id = ?').run(status, now, userId);
    },
    deleteToken(userId: number) {
      db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
    },
  };
}
