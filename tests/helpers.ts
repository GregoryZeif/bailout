import { applyAction, createGame, addPlayer, tick, type Ctx } from '../src/shared/engine';
import type { Action, GameState } from '../src/shared/types';

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG with a queue of scripted values; falls back to a seeded stream. */
export class ScriptedRng {
  queue: number[] = [];
  private fallback = seeded(42);
  next = (): number => (this.queue.length ? this.queue.shift()! : this.fallback());
  dice(d1: number, d2: number) {
    this.queue.push((d1 - 1) / 6 + 0.01, (d2 - 1) / 6 + 0.01);
    return this;
  }
  push(...v: number[]) {
    this.queue.push(...v);
    return this;
  }
}

export class TestGame {
  rng = new ScriptedRng();
  now = 1_000_000;
  s: GameState;
  events: ReturnType<typeof applyAction> = [];

  constructor(n = 2, opts: { start?: boolean } = {}) {
    this.s = createGame({ id: 'g1', code: 'ABCD', hostId: 'p0', hostName: 'Alice', now: this.now });
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
    for (let i = 1; i < n; i++) addPlayer(this.s, { id: `p${i}`, name: names[i] }, this.now);
    if (opts.start !== false) this.start();
  }

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng.next };
  }

  start() {
    for (const p of this.s.players) if (p.id !== this.s.hostId) this.act(p.id, { type: 'setReady', ready: true });
    // keep deterministic seating: p0, p1, ... (shuffle consumes rng; we re-sort after)
    this.act(this.s.hostId, { type: 'start' });
    this.s.players.sort((a, b) => a.id.localeCompare(b.id));
    this.s.current = 0;
  }

  act(playerId: string, action: Action) {
    const clone = structuredClone(this.s);
    this.events = applyAction(clone, playerId, action, this.ctx);
    this.s = clone;
    return this.events;
  }

  tick(ms = 0) {
    this.now += ms;
    this.events = tick(this.s, this.ctx);
    return this.events;
  }

  p(id: string) {
    return this.s.players.find((x) => x.id === id)!;
  }

  get cur() {
    return this.s.players[this.s.current];
  }

  own(playerId: string, ...spaces: number[]) {
    for (const i of spaces) this.s.properties[i] = { ownerId: playerId, upgrades: 0, mortgaged: false };
  }

  /** Put the active player at a position and roll the given dice. */
  rollFrom(pos: number, d1: number, d2: number) {
    this.cur.position = pos;
    this.rng.dice(d1, d2);
    return this.act(this.cur.id, { type: 'roll' });
  }
}
