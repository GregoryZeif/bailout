import express from 'express';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { Server, type Socket } from 'socket.io';
import { addPlayer, applyAction, createGame, sanitizeName, setConnected, tick, type Ctx } from '../shared/engine.js';
import { RULES } from '../shared/board.js';
import { GameError, type Action, type GameEvent, type GameState } from '../shared/types.js';
import { viewFor, type ClientToServer, type ServerToClient } from '../shared/view.js';
import { Store, type Session } from './db.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FINISHED_TTL_MS = 24 * 3600_000;
const IDLE_TTL_MS = 48 * 3600_000;

export interface ServerOptions {
  port: number;
  dataDir: string;
  staticDir?: string;
  /** Override randomness (tests). Defaults to crypto-strength RNG. */
  rng?: () => number;
  tickMs?: number;
  now?: () => number;
}

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient> & { data: { session: Session } };

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

/** Crypto-backed float in [0,1). */
const cryptoRng = () => randomInt(0, 2 ** 47) / 2 ** 47;

class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string, now: number): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

export async function startServer(opts: ServerOptions) {
  const now = opts.now ?? (() => Date.now());
  const rng = opts.rng ?? cryptoRng;
  const store = new Store(opts.dataDir);
  const rooms = new Map<string, GameState>();
  /** code -> playerId -> number of live sockets */
  const presence = new Map<string, Map<string, number>>();
  const actionLimiter = new RateLimiter(30, 5000);
  const chatLimiter = new RateLimiter(5, 4000);

  for (const s of store.loadRooms()) {
    // Everyone is disconnected after a restart; grace periods start now.
    for (const p of s.players) setConnected(s, p.id, false, now());
    rooms.set(s.code, s);
  }
  log(`[server] restored ${rooms.size} room(s)`);

  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')));
  }

  const http: HttpServer = createServer(app);
  const io: IO = new Server(http, { cors: { origin: false }, maxHttpBufferSize: 64_000, pingInterval: 10_000, pingTimeout: 8_000 });

  const ctx = (): Ctx => ({ now: now(), rng });

  function newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function broadcast(s: GameState, events: GameEvent[]) {
    const t = now();
    for (const sock of io.sockets.adapter.rooms.get(s.code) ?? []) {
      const so = io.sockets.sockets.get(sock) as Sock | undefined;
      if (!so) continue;
      so.emit('state', { view: viewFor(s, so.data.session.playerId, t), events });
    }
  }

  function persist(s: GameState) {
    try {
      store.saveRoom(s);
    } catch (e) {
      log('[store] save failed', s.code, e);
    }
  }

  function commit(s: GameState, events: GameEvent[]) {
    rooms.set(s.code, s);
    if (s.status === 'lobby' && s.players.length === 0) {
      rooms.delete(s.code);
      store.deleteRoom(s.code);
      return;
    }
    persist(s);
    broadcast(s, events);
  }

  function roomsOf(playerId: string): string[] {
    return [...rooms.values()].filter((r) => r.status !== 'finished' && r.players.some((p) => p.id === playerId)).map((r) => r.code);
  }

  function markPresence(code: string, playerId: string, delta: 1 | -1) {
    const m = presence.get(code) ?? new Map<string, number>();
    presence.set(code, m);
    const n = Math.max(0, (m.get(playerId) ?? 0) + delta);
    m.set(playerId, n);
    const s = rooms.get(code);
    if (!s) return;
    const next = structuredClone(s);
    setConnected(next, playerId, n > 0, now());
    if (next.updatedAt !== s.updatedAt) commit(next, []);
  }

  const errorAck = (e: unknown) => {
    if (e instanceof GameError) return { ok: false as const, error: e.code, params: e.params };
    log('[server] unexpected error', e);
    return { ok: false as const, error: 'err.server' };
  };

  io.on('connection', (raw) => {
    const socket = raw as Sock;
    const auth = (socket.handshake.auth ?? {}) as { token?: string; name?: string };
    let token = typeof auth.token === 'string' ? auth.token : '';
    let session = token ? store.getSession(token) : null;
    if (!session) {
      const created = store.createSession(sanitizeName(auth.name ?? 'Player'));
      token = created.token;
      session = created.session;
    }
    socket.data.session = session;
    const joined = new Set<string>();
    socket.emit('session', { token, playerId: session.playerId, name: session.name, rooms: roomsOf(session.playerId) });

    const subscribe = (code: string) => {
      if (joined.has(code)) return;
      joined.add(code);
      socket.join(code);
      markPresence(code, session!.playerId, 1);
    };

    socket.on('profile', (p, ack) => {
      if (typeof ack !== 'function') return;
      const name = sanitizeName(p?.name ?? '');
      session!.name = name;
      store.setName(session!.playerId, name);
      ack({ ok: true });
    });

    socket.on('room:create', (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!actionLimiter.allow(session!.playerId, now())) return ack({ ok: false, error: 'err.rateLimited' });
      try {
        const name = sanitizeName(p?.name ?? session!.name);
        const code = newCode();
        const s = createGame({ id: code, code, hostId: session!.playerId, hostName: name, now: now() });
        rooms.set(code, s);
        persist(s);
        subscribe(code);
        broadcast(s, []);
        log(`[room] ${code} created by ${session!.playerId}`);
        ack({ ok: true, code });
      } catch (e) {
        ack(errorAck(e));
      }
    });

    socket.on('room:join', (p, ack) => {
      if (typeof ack !== 'function') return;
      const code = String(p?.code ?? '').toUpperCase().trim();
      const s = rooms.get(code);
      if (!s) return ack({ ok: false, error: 'err.noRoom' });
      try {
        const isMember = s.players.some((x) => x.id === session!.playerId);
        if (!isMember) {
          const next = structuredClone(s);
          addPlayer(next, { id: session!.playerId, name: sanitizeName(p?.name ?? session!.name) }, now());
          commit(next, []);
        }
        subscribe(code);
        broadcast(rooms.get(code)!, []);
        ack({ ok: true, code });
      } catch (e) {
        ack(errorAck(e));
      }
    });

    socket.on('room:leave', (p, ack) => {
      if (typeof ack !== 'function') return;
      const code = String(p?.code ?? '');
      const s = rooms.get(code);
      if (!s) return ack({ ok: true });
      try {
        const me = s.players.find((x) => x.id === session!.playerId);
        if (me && !(s.status === 'playing' && me.bankrupt) && s.status !== 'finished') {
          const next = structuredClone(s);
          const events = applyAction(next, session!.playerId, { type: 'leave' }, ctx());
          commit(next, events);
        }
        if (joined.delete(code)) {
          socket.leave(code);
          markPresence(code, session!.playerId, -1);
        }
        ack({ ok: true });
      } catch (e) {
        ack(errorAck(e));
      }
    });

    socket.on('action', (p, ack) => {
      if (typeof ack !== 'function') return;
      const t = now();
      if (!actionLimiter.allow(session!.playerId, t)) return ack({ ok: false, error: 'err.rateLimited' });
      const code = String(p?.code ?? '');
      const actionId = String(p?.actionId ?? '').slice(0, 64);
      const action = p?.action as Action;
      const s = rooms.get(code);
      if (!s) return ack({ ok: false, error: 'err.noRoom' });
      if (!joined.has(code)) return ack({ ok: false, error: 'err.notInRoom' });
      if (!actionId) return ack({ ok: false, error: 'err.badAction' });
      if (action?.type === 'chat' && !chatLimiter.allow(session!.playerId, t)) return ack({ ok: false, error: 'err.rateLimited' });
      const dedupKey = `${session!.playerId}:${actionId}`;
      // Idempotency: a retried action (same id) is acknowledged without re-applying.
      if (s.processed.includes(dedupKey)) return ack({ ok: true });
      // Node runs this handler to completion before any other message, so the
      // clone → apply → commit sequence is atomic per room (no interleaving).
      const next = structuredClone(s);
      try {
        const events = applyAction(next, session!.playerId, action, ctx());
        next.processed.push(dedupKey);
        if (next.processed.length > RULES.processedLimit) next.processed.splice(0, next.processed.length - RULES.processedLimit);
        commit(next, events);
        ack({ ok: true });
      } catch (e) {
        ack(errorAck(e));
      }
    });

    socket.on('disconnect', () => {
      for (const code of joined) markPresence(code, session!.playerId, -1);
      joined.clear();
    });
  });

  const tickTimer = setInterval(() => {
    const t = now();
    for (const s of [...rooms.values()]) {
      try {
        if (s.status === 'finished') {
          if (s.finishedAt && t - s.finishedAt > FINISHED_TTL_MS) {
            rooms.delete(s.code);
            store.deleteRoom(s.code);
          }
          continue;
        }
        if (t - s.updatedAt > IDLE_TTL_MS) {
          rooms.delete(s.code);
          store.deleteRoom(s.code);
          log(`[room] ${s.code} expired (idle)`);
          continue;
        }
        const next = structuredClone(s);
        const before = next.seq;
        const hostBefore = next.hostId;
        const events = tick(next, ctx());
        if (events.length || next.seq !== before || next.hostId !== hostBefore || next.status !== s.status) commit(next, events);
      } catch (e) {
        log('[tick] error in room', s.code, e);
      }
    }
  }, opts.tickMs ?? 1000);

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  log(`[server] listening on :${port}`);

  return {
    port,
    rooms,
    async close() {
      clearInterval(tickTimer);
      for (const s of rooms.values()) persist(s);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      store.close();
    },
  };
}
