/** Integration tests: real server + multiple socket.io clients. */
import { afterAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/app';
import type { GameView } from '../src/shared/view';
import type { Action } from '../src/shared/types';

const dir = mkdtempSync(join(tmpdir(), 'mono-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Client {
  sock: Socket;
  token: string;
  playerId: string;
  rooms: string[];
  view: GameView | null;
  emit<T = { ok: boolean; error?: string; code?: string }>(ev: string, p: unknown): Promise<T>;
  act(action: Action, actionId?: string): Promise<{ ok: boolean; error?: string }>;
  waitFor(pred: (v: GameView) => boolean, ms?: number): Promise<GameView>;
  code: string;
}

async function client(port: number, token?: string, name = 'Tester'): Promise<Client> {
  const sock = connect(`http://localhost:${port}`, { auth: { token, name }, transports: ['websocket'], forceNew: true });
  const c = { sock, view: null, code: '' } as unknown as Client;
  const listeners: (() => void)[] = [];
  sock.on('state', ({ view }: { view: GameView }) => {
    c.view = view;
    listeners.forEach((l) => l());
  });
  await new Promise<void>((resolve) =>
    sock.once('session', (s: { token: string; playerId: string; rooms: string[] }) => {
      c.token = s.token;
      c.playerId = s.playerId;
      c.rooms = s.rooms;
      resolve();
    }));
  let n = 0;
  c.emit = (ev, p) => new Promise((resolve) => sock.emit(ev, p, resolve));
  c.act = (action, actionId) => c.emit('action', { code: c.code, actionId: actionId ?? `${c.playerId}-${n++}-${Math.random()}`, action });
  c.waitFor = (pred, ms = 3000) =>
    new Promise((resolve, reject) => {
      if (c.view && pred(c.view)) return resolve(c.view);
      const timer = setTimeout(() => reject(new Error('waitFor timeout')), ms);
      const l = () => {
        if (c.view && pred(c.view)) {
          clearTimeout(timer);
          resolve(c.view);
        }
      };
      listeners.push(l);
    });
  return c;
}

describe('multiplayer server', () => {
  let port = 0;
  let server: Awaited<ReturnType<typeof startServer>>;
  let a: Client;
  let b: Client;

  it('creates and joins rooms from different sessions', async () => {
    server = await startServer({ port: 0, dataDir: dir, tickMs: 200 });
    port = server.port;
    a = await client(port, undefined, 'Alice');
    b = await client(port, undefined, 'Bob');
    expect(a.playerId).not.toBe(b.playerId);
    const res = await a.emit('room:create', { name: 'Alice' });
    expect(res.ok).toBe(true);
    a.code = b.code = res.code!;
    expect((await b.emit('room:join', { code: a.code, name: 'Bob' })).ok).toBe(true);
    const v = await a.waitFor((x) => x.players.length === 2);
    expect(v.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect((await b.emit('room:join', { code: 'ZZZZZ' })).error).toBe('err.noRoom');
  });

  it('starts the game; turn and phase are server-validated', async () => {
    expect((await a.act({ type: 'start' })).error).toBe('err.notReady');
    expect(await b.act({ type: 'setReady', ready: true })).toEqual({ ok: true });
    expect(await a.act({ type: 'start' })).toEqual({ ok: true });
    const v = await a.waitFor((x) => x.status === 'playing');
    expect(v.decks.chance).toBeGreaterThan(0);
    expect((v as unknown as { processed?: unknown }).processed).toBeUndefined();
    const curId = v.players[v.current].id;
    const [me, other] = curId === a.playerId ? [a, b] : [b, a];
    expect((await other.act({ type: 'roll' })).error).toBe('err.notYourTurn');
    expect((await other.act({ type: 'borrow', amount: 123 })).error).toBe('err.badAmount');
    // forged/unknown actions are rejected
    expect((await me.act({ type: 'giveMeMoney' } as unknown as Action)).error).toBe('err.badAction');
    const cashBefore = v.players.find((p) => p.id === me.playerId)!.cash;
    const id = 'dup-roll-1';
    const r1 = await me.act({ type: 'roll' }, id);
    const r2 = await me.act({ type: 'roll' }, id); // network retry
    expect(r1.ok && r2.ok).toBe(true);
    // not `x.rolled`: doubles onto an unbuyable space grant an extra roll and reset it in the same action
    const after = await me.waitFor((x) => x.log.some((l) => l.key === 'log.rolled'));
    const rolls = after.log.filter((l) => l.key === 'log.rolled');
    expect(rolls).toHaveLength(1);
    expect(after.players.find((p) => p.id === me.playerId)!.cash).toBeGreaterThanOrEqual(0);
    void cashBefore;
  });

  it('chat is broadcast and sanitized', async () => {
    await a.act({ type: 'chat', text: '  hello <b>world</b>  ' });
    const v = await b.waitFor((x) => x.chat.length > 0);
    expect(v.chat[0].text).toBe('hello <b>world</b>');
  });

  it('refresh/reconnect with token restores the same player and state', async () => {
    const token = a.token;
    const pid = a.playerId;
    a.sock.disconnect();
    await b.waitFor((x) => x.players.some((p) => p.id === pid && !p.connected));
    const a2 = await client(port, token);
    expect(a2.playerId).toBe(pid);
    expect(a2.rooms).toContain(a.code);
    a2.code = a.code;
    expect((await a2.emit('room:join', { code: a.code })).ok).toBe(true);
    await b.waitFor((x) => x.players.some((p) => p.id === pid && p.connected));
    a = a2;
  });

  it('survives a server restart', async () => {
    const code = a.code;
    const seqBefore = server.rooms.get(code)!.seq;
    a.sock.disconnect();
    b.sock.disconnect();
    await server.close();
    server = await startServer({ port: 0, dataDir: dir, tickMs: 200 });
    const a3 = await client(server.port, a.token);
    a3.code = code;
    expect((await a3.emit('room:join', { code })).ok).toBe(true);
    const v = await a3.waitFor((x) => x.status === 'playing');
    expect(v.seq).toBeGreaterThanOrEqual(seqBefore);
    a3.sock.disconnect();
    await server.close();
  });
});
