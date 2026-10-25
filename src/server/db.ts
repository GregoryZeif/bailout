import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '../shared/types.js';

export interface Session {
  playerId: string;
  name: string;
}

/** SQLite persistence: the source of truth survives refreshes and restarts. */
export class Store {
  private db: Database.Database;

  constructor(dataDir: string) {
    let file = ':memory:';
    if (dataDir !== ':memory:') {
      mkdirSync(dataDir, { recursive: true });
      file = join(dataDir, 'bailout.db');
      // The game used to be called Monopoly 2026: carry its database over once.
      const legacy = join(dataDir, 'monopoly.db');
      if (!existsSync(file) && existsSync(legacy)) {
        for (const ext of ['', '-wal', '-shm']) if (existsSync(legacy + ext)) renameSync(legacy + ext, file + ext);
      }
    }
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        player_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createSession(name: string): { token: string; session: Session } {
    const token = randomBytes(32).toString('base64url');
    const playerId = `u_${randomBytes(9).toString('base64url')}`;
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token_hash, player_id, name, created_at, seen_at) VALUES (?, ?, ?, ?, ?)')
      .run(Store.hash(token), playerId, name, now, now);
    return { token, session: { playerId, name } };
  }

  getSession(token: string): Session | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.db.prepare('SELECT player_id, name FROM sessions WHERE token_hash = ?').get(Store.hash(token)) as
      | { player_id: string; name: string }
      | undefined;
    if (!row) return null;
    this.db.prepare('UPDATE sessions SET seen_at = ? WHERE token_hash = ?').run(Date.now(), Store.hash(token));
    return { playerId: row.player_id, name: row.name };
  }

  setName(playerId: string, name: string) {
    this.db.prepare('UPDATE sessions SET name = ? WHERE player_id = ?').run(name, playerId);
  }

  saveRoom(s: GameState) {
    this.db.prepare(`INSERT INTO rooms (code, status, state, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET status = excluded.status, state = excluded.state, updated_at = excluded.updated_at`)
      .run(s.code, s.status, JSON.stringify(s), s.updatedAt);
  }

  deleteRoom(code: string) {
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
  }

  loadRooms(): GameState[] {
    const rows = this.db.prepare('SELECT state FROM rooms').all() as { state: string }[];
    const out: GameState[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.state) as GameState);
      } catch (e) {
        console.error('[store] corrupt room row skipped', e);
      }
    }
    return out;
  }

  close() {
    this.db.close();
  }
}
