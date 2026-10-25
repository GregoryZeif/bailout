/**
 * Tester library: every card, quiz question (with its answer) and inflation
 * event, with amounts filled in for a fresh game. Server-only, because it
 * includes the quiz answers.
 */
import { CARDS, type CardEffect } from '../shared/cards.js';
import { computeParams, createGame } from '../shared/engine.js';
import { fill } from '../shared/i18n/index.js';
import { INFLATION_EVENTS } from '../shared/inflation.js';
import { QUIZ } from '../shared/quiz.js';
import { QUIZ_ANSWERS } from '../shared/quizAnswers.js';
import type { Lang } from '../shared/types.js';
import type { TesterLibrary } from '../shared/view.js';

const LANGS: Lang[] = ['en', 'ru'];

export function testerLibrary(): TesterLibrary {
  const s = createGame({ id: 'lib', code: 'LIB', hostId: 'p', hostName: 'Tester', now: 0 });
  const p = s.players[0];
  p.cash = s.config.startingCash;
  const text = (t: Record<Lang, string>, effects: CardEffect[]) => {
    const params = computeParams(s, p, effects);
    return Object.fromEntries(LANGS.map((l) => [l, fill(l, t[l], params)])) as Record<Lang, string>;
  };
  return {
    cards: CARDS.map((c) => {
      const choice = c.effects.find((x) => x.kind === 'choice');
      return {
        id: c.id, deck: c.deck, category: c.category, text: text(c.text, c.effects),
        choices: choice && choice.kind === 'choice' ? choice.options.map((o) => o.label) : [],
      };
    }),
    quiz: QUIZ.map((q) => ({ id: q.id, q: q.q, options: q.options, answer: QUIZ_ANSWERS[q.id] })),
    inflation: INFLATION_EVENTS.map((ev) => ({ id: ev.id, weight: ev.weight, text: text(ev.text, ev.effects) })),
  };
}
