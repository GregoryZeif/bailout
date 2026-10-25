import { describe, expect, it } from 'vitest';
import { CARDS, type CardEffect } from '../src/shared/cards';
import { INFLATION_EVENTS } from '../src/shared/inflation';
import { QUIZ } from '../src/shared/quiz';
import { QUIZ_ANSWERS } from '../src/shared/quizAnswers';
import { computeParams } from '../src/shared/engine';
import { TestGame } from './helpers';

const placeholders = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const MOVES = new Set(['moveTo', 'moveBy', 'nearest']);

function checkInvariants(g: TestGame) {
  for (const p of g.s.players) {
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.cash)).toBe(true);
    expect(p.loan).toBeGreaterThanOrEqual(0);
  }
  for (const [, o] of Object.entries(g.s.properties)) {
    expect(g.s.players.some((p) => p.id === o.ownerId && !p.bankrupt)).toBe(true);
  }
}

describe('event cards', () => {
  it('has at least 60 cards across all six categories with unique ids', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.category))).toEqual(
      new Set(['economic', 'political', 'luck', 'bureaucracy', 'corporate', 'social']),
    );
  });

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: text placeholders match effect values in EN and RU', (_id, card) => {
    const g = new TestGame(3);
    const params = computeParams(g.s, g.p('p0'), card.effects);
    for (const lang of ['en', 'ru'] as const) {
      expect(card.text[lang].length).toBeGreaterThan(10);
      for (const ph of placeholders(card.text[lang])) expect(params, `${card.id} ${lang} {${ph}}`).toHaveProperty(ph);
    }
    expect(placeholders(card.text.en).sort()).toEqual(placeholders(card.text.ru).sort());
    const check = (effs: CardEffect[]) => {
      effs.forEach((e, i) => {
        if (MOVES.has(e.kind)) expect(i, `${card.id}: movement must be last`).toBe(effs.length - 1);
        if (e.kind === 'choice') e.options.forEach((o) => { expect(o.label.en && o.label.ru).toBeTruthy(); check(o.effects); });
      });
    };
    check(card.effects);
  });

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: applies through the engine', (_id, card) => {
    const options = card.effects.find((e) => e.kind === 'choice');
    const optionCount = options && options.kind === 'choice' ? options.options.length : 1;
    for (let opt = 0; opt < optionCount; opt++) {
      const g = new TestGame(3);
      g.own('p1', 39);
      g.own('p2', 25);
      g.p('p0').loan = 1200;
      const space = card.deck === 'chance' ? 7 : 2;
      g.s.decks[card.deck] = [card.id, ...g.s.decks[card.deck].filter((x) => x !== card.id)];
      g.s.economy.bailoutPot = 800;
      const before = structuredClone(g.s);
      g.rollFrom(space - 3, 1, 2);
      expect(g.s.lastCard?.cardId).toBe(card.id);
      if (g.s.phase === 'cardChoice') g.act('p0', { type: 'cardChoice', option: opt });
      checkInvariants(g);
      expect(['postRoll', 'awaitBuy', 'debt', 'preRoll', 'cardChoice']).toContain(g.s.phase);
      // Something observable must change for every card (money, position, loan, economy, cards, ownership).
      const changed = JSON.stringify(before.players) !== JSON.stringify(g.s.players)
        || JSON.stringify(before.economy) !== JSON.stringify(g.s.economy)
        || JSON.stringify(before.properties) !== JSON.stringify(g.s.properties)
        || g.s.debts.length > 0;
      if (!(card.id === 'soc_inheritance' && opt === 1)) expect(changed, card.id).toBe(true);
    }
  });

  it('inflation events have bilingual text with matching placeholders', () => {
    const g = new TestGame(2);
    for (const evt of INFLATION_EVENTS) {
      const params = computeParams(g.s, null, evt.effects);
      for (const lang of ['en', 'ru'] as const) for (const ph of placeholders(evt.text[lang])) expect(params).toHaveProperty(ph);
    }
  });
});

describe('citizenship test data', () => {
  it('every question has 3 options in both languages and a valid answer', () => {
    expect(QUIZ.length).toBeGreaterThanOrEqual(10);
    for (const q of QUIZ) {
      expect(q.options).toHaveLength(3);
      expect(q.q.en && q.q.ru).toBeTruthy();
      q.options.forEach((o) => expect(o.en && o.ru).toBeTruthy());
      expect([0, 1, 2]).toContain(QUIZ_ANSWERS[q.id]);
    }
  });
});
