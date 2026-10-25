/** Computer players: lobby rules and full games played by the server bot policy. */
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, tick, type Ctx } from '../src/shared/engine';
import { botFallback, botMove, type BotMove } from '../src/server/bot';
import { GameError, type GameState } from '../src/shared/types';
import { TestGame, seeded } from './helpers';

const expectErr = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('bots in the lobby', () => {
  it('host adds ready bots with distinct names and can remove them', () => {
    const g = new TestGame(2, { start: false });
    expectErr(() => g.act('p1', { type: 'addBot' }), 'err.hostOnly');
    g.act('p0', { type: 'addBot' });
    g.act('p0', { type: 'addBot' });
    const bots = g.s.players.filter((p) => p.bot);
    expect(bots).toHaveLength(2);
    expect(bots.every((b) => b.ready && b.connected)).toBe(true);
    expect(new Set(bots.map((b) => b.name)).size).toBe(2);
    expectErr(() => g.act('p0', { type: 'removeBot', playerId: 'p1' }), 'err.noPlayer');
    g.act('p0', { type: 'removeBot', playerId: bots[0].id });
    expect(g.s.players.filter((p) => p.bot)).toHaveLength(1);
  });

  it('a single human can start against a bot', () => {
    const g = new TestGame(1, { start: false });
    expectErr(() => g.act('p0', { type: 'start' }), 'err.needPlayers');
    g.act('p0', { type: 'addBot' });
    g.act('p0', { type: 'start' });
    expect(g.s.status).toBe('playing');
  });

  it('respects max players', () => {
    const g = new TestGame(1, { start: false });
    g.act('p0', { type: 'configure', config: { maxPlayers: 2 } });
    g.act('p0', { type: 'addBot' });
    expectErr(() => g.act('p0', { type: 'addBot' }), 'err.roomFull');
  });

  it('host never passes to a bot; bots alone empty the room', () => {
    const g = new TestGame(2, { start: false });
    g.act('p0', { type: 'addBot' });
    g.act('p0', { type: 'leave' });
    expect(g.s.hostId).toBe('p1');
    g.act('p1', { type: 'leave' });
    expect(g.s.players).toHaveLength(0);
  });
});

function botGame(seed: number, bots: number) {
  const r = seeded(seed);
  let now = 1_700_000_000_000;
  const ctx = (): Ctx => ({ now, rng: r });
  let s: GameState = createGame({ id: 'b', code: 'BOTS', hostId: 'h', hostName: 'Host', now });
  for (let i = 0; i < bots; i++) applyAction(s, 'h', { type: 'addBot' }, ctx());
  applyAction(s, 'h', { type: 'configure', config: { timeLimitMinutes: 0 } }, ctx());
  applyAction(s, 'h', { type: 'start' }, ctx());
  // The human host forfeits at once: from here on only the bot policy plays.
  applyAction(s, 'h', { type: 'leave' }, ctx());
  let rejected = 0;
  const attempt = (m: BotMove | null): boolean => {
    if (!m) return false;
    const next = structuredClone(s);
    try {
      applyAction(next, m.playerId, m.action, ctx());
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      rejected++;
      return false;
    }
    s = next;
    return true;
  };
  for (let step = 0; step < 30000 && s.status === 'playing'; step++) {
    now += 1000;
    const move = botMove(s, now, r);
    if (attempt(move) || (move && attempt(botFallback(s, move)))) continue;
    // No bot move: let time run until the engine's timers act.
    now += 5000;
    const t = structuredClone(s);
    tick(t, ctx());
    s = t;
  }
  return { s, rejected };
}

describe('bot-only games', () => {
  it('bots play complete games to a winner without stalling', () => {
    let finished = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s, rejected } = botGame(seed, 2 + (seed % 4));
      if (s.status === 'finished') {
        finished++;
        expect(s.winnerId).toBeTruthy();
        expect(s.players.find((p) => p.id === s.winnerId)?.bot).toBe(true);
      }
      expect(rejected).toBeLessThan(20);
    }
    expect(finished).toBeGreaterThanOrEqual(10);
  });

  it('bots never leave their move to the turn timer', () => {
    for (const seed of [7, 8, 9]) {
      const { s } = botGame(seed, 3);
      expect(s.log.filter((l) => l.key === 'log.timeout')).toHaveLength(0);
    }
  });
});
