/** Tester mode: cheat tools stay locked outside tester rooms; the library exposes every hidden text. */
import { describe, expect, it } from 'vitest';
import { addPlayer, applyAction, createGame, type Ctx } from '../src/shared/engine';
import { CARDS } from '../src/shared/cards';
import { QUIZ } from '../src/shared/quiz';
import { INFLATION_EVENTS } from '../src/shared/inflation';
import { testerLibrary } from '../src/server/tester';
import { GameError, type Action, type GameState } from '../src/shared/types';
import { TestGame, seeded } from './helpers';

function testRoom() {
  const now = 1_000_000;
  const ctx: Ctx = { now, rng: seeded(3) };
  const s = createGame({ id: 't', code: 'TEST', hostId: 'h', hostName: 'Host', now, visibility: 'public', testMode: true });
  addPlayer(s, { id: 'g', name: 'Guest' }, now);
  applyAction(s, 'g', { type: 'setReady', ready: true }, ctx);
  applyAction(s, 'h', { type: 'start' }, ctx);
  // Seat the host first so the tools can be checked on their own turn.
  s.current = s.players.findIndex((p) => p.id === 'h');
  const act = (pid: string, a: Action) => {
    const next = structuredClone(s);
    applyAction(next, pid, a, ctx);
    Object.assign(s, next);
  };
  return { s, act };
}

const errCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as GameError).code;
  }
  return null;
};

describe('tester rooms', () => {
  it('are never public', () => {
    const { s, act } = testRoom();
    expect(s.visibility).toBe('private');
    expect(s.testMode).toBe(true);
    void act;
  });

  it('cheats are refused in normal games and for non-hosts', () => {
    const g = new TestGame(2);
    expect(errCode(() => g.act('p0', { type: 'testCash', amount: 5000 }))).toBe('err.testerOnly');
    const { s, act } = testRoom();
    expect(errCode(() => act('g', { type: 'testCash', amount: 5000 }))).toBe('err.hostOnly');
    act('h', { type: 'testCash', amount: 5000 });
    expect(s.players.find((p) => p.id === 'h')!.cash).toBe(s.config.startingCash + 5000);
  });

  it('preset dice, teleport and stacked cards work', () => {
    const { s, act } = testRoom();
    const cur = () => s.players[s.current];
    const card = CARDS.find((c) => c.deck === 'chance' && c.effects.every((e) => e.kind === 'collect'))!;
    act('h', { type: 'testStackCard', cardId: card.id });
    expect(s.decks.chance[0]).toBe(card.id);
    act('h', { type: 'testMoveTo', space: 7 }); // a Breaking News space
    expect(cur().position).toBe(7);
    expect(s.lastCard?.cardId).toBe(card.id);
    act('h', { type: 'testDice', d1: 6, d2: 6 });
    expect(s.testDice).toEqual([[6, 6]]);
    expect(errCode(() => act('h', { type: 'testDice', d1: 7, d2: 1 }))).toBe('err.badAmount');
  });

  it('the next roll uses the preset dice', () => {
    const { s, act } = testRoom();
    act('h', { type: 'testDice', d1: 2, d2: 3 });
    act('h', { type: 'roll' });
    expect(s.lastDice).toEqual([2, 3]);
    expect((s as GameState).testDice).toEqual([]);
  });
});

describe('tester library', () => {
  it('has every card, quiz answer and inflation event with amounts filled in', () => {
    const lib = testerLibrary();
    expect(lib.cards).toHaveLength(CARDS.length);
    expect(lib.quiz).toHaveLength(QUIZ.length);
    expect(lib.inflation).toHaveLength(INFLATION_EVENTS.length);
    for (const q of lib.quiz) expect([0, 1, 2]).toContain(q.answer);
    for (const c of lib.cards) {
      expect(c.text.en).not.toMatch(/\{\w+\}/);
      expect(c.text.ru).not.toMatch(/\{\w+\}/);
    }
  });
});
