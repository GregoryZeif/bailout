/**
 * Full-game fuzzing: bots play complete matches from lobby to victory with
 * deterministic seeds. After every step we check money and ownership invariants.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, addPlayer, createGame, tick, type Ctx } from '../src/shared/engine';
import { BOARD, isOwnable } from '../src/shared/board';
import { QUIZ_ANSWERS } from '../src/shared/quizAnswers';
import { availableCredit, currentPrice, luxuryTax, mortgageBlocker, ownedBy, sellUpgradeBlocker, upgradeBlocker, upgradeCost } from '../src/shared/rules';
import { GameError, type Action, type GameState } from '../src/shared/types';
import { seeded } from './helpers';

function invariants(s: GameState) {
  const ids = new Set(s.players.map((p) => p.id));
  for (const p of s.players) {
    if (!(p.cash >= 0 && Number.isInteger(p.cash))) throw new Error(`bad cash ${p.name} ${p.cash}`);
    if (p.loan < 0) throw new Error('negative loan');
    if (p.bankrupt && ownedBy(s, p.id).length) throw new Error('bankrupt owns property');
  }
  for (const [k, o] of Object.entries(s.properties)) {
    if (!ids.has(o.ownerId)) throw new Error('unknown owner');
    if (!isOwnable(BOARD[Number(k)])) throw new Error('owning non-ownable');
    if (o.upgrades < 0 || o.upgrades > 5) throw new Error('bad upgrades');
    if (o.mortgaged && o.upgrades > 0) throw new Error('mortgaged with upgrades');
  }
  for (const d of s.debts) if (d.amount <= 0) throw new Error('bad debt');
  if (s.status === 'playing' && s.players[s.current].bankrupt && s.phase !== 'auction' && s.phase !== 'debt') {
    throw new Error('bankrupt player holds the turn');
  }
}

function botAction(s: GameState, r: () => number): { pid: string; action: Action } | null {
  const cur = s.players[s.current];
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  switch (s.phase) {
    case 'debt': {
      const d = s.debts[0];
      const p = s.players.find((x) => x.id === d.debtorId)!;
      if (p.cash >= d.amount) return { pid: p.id, action: { type: 'settleDebt' } };
      const owned = ownedBy(s, p.id);
      const sell = owned.find((i) => !sellUpgradeBlocker(s, p.id, i));
      if (sell !== undefined) return { pid: p.id, action: { type: 'sellUpgrade', space: sell } };
      const mort = owned.find((i) => !mortgageBlocker(s, p.id, i));
      if (mort !== undefined) return { pid: p.id, action: { type: 'mortgage', space: mort } };
      const credit = Math.floor(availableCredit(s, p) / 100) * 100;
      if (credit >= 100 && r() < 0.7) return { pid: p.id, action: { type: 'borrow', amount: credit } };
      return { pid: p.id, action: { type: 'declareBankruptcy' } };
    }
    case 'auction': {
      const a = s.auction!;
      const bidders = s.players.filter((p) => !p.bankrupt && !a.passed.includes(p.id) && p.id !== a.highBidderId);
      if (!bidders.length) return null;
      const b = pick(bidders);
      const amount = (a.highBid || 0) + 100 + Math.floor(r() * 5) * 100;
      if (amount <= b.cash && amount < currentPrice(s, a.space) && r() < 0.6) return { pid: b.id, action: { type: 'bid', amount } };
      return { pid: b.id, action: { type: 'passAuction' } };
    }
    case 'awaitBuy': {
      const cost = currentPrice(s, cur.position) + luxuryTax(s, cur.position);
      if (cur.cash < cost && availableCredit(s, cur) >= cost - cur.cash && r() < 0.5) {
        return { pid: cur.id, action: { type: 'borrow', amount: Math.ceil((cost - cur.cash) / 100) * 100 } };
      }
      return { pid: cur.id, action: { type: cur.cash >= cost && r() < 0.8 ? 'buy' : 'decline' } };
    }
    case 'cardChoice':
      return { pid: cur.id, action: { type: 'cardChoice', option: Math.floor(r() * 2) } };
    case 'quiz': {
      const q = s.quiz!;
      const i = q.answers.findIndex((a) => a === null);
      const ans = r() < 0.6 ? QUIZ_ANSWERS[q.questionIds[i]] : Math.floor(r() * 3);
      return { pid: cur.id, action: { type: 'quizAnswer', index: i, answer: ans } };
    }
    case 'preRoll': {
      if (r() < 0.05) {
        const others = s.players.filter((p) => p.id !== cur.id && !p.bankrupt);
        const to = pick(others);
        const mine = ownedBy(s, cur.id);
        const theirs = ownedBy(s, to.id);
        return {
          pid: cur.id,
          action: {
            type: 'tradeOffer', toId: to.id,
            give: { cash: Math.min(cur.cash, 100 * Math.floor(r() * 5)), properties: mine.length && r() < 0.5 ? [pick(mine)] : [], jailCards: 0 },
            get: { cash: 0, properties: theirs.length ? [pick(theirs)] : [], jailCards: 0 },
          },
        };
      }
      if (cur.inJail) {
        const opts: Action[] = [{ type: 'jailRoll13' }];
        if (cur.cash >= 1000) opts.push({ type: 'jailPay' });
        if (cur.jailCards) opts.push({ type: 'jailCard' });
        if (!cur.quizTakenThisTurn) opts.push({ type: 'quizStart' });
        return { pid: cur.id, action: pick(opts) };
      }
      return { pid: cur.id, action: { type: 'roll' } };
    }
    case 'postRoll': {
      const up = ownedBy(s, cur.id).find((i) => !upgradeBlocker(s, cur.id, i) && upgradeCost(s, i) < cur.cash * 0.6);
      if (up !== undefined && r() < 0.7) return { pid: cur.id, action: { type: 'upgrade', space: up } };
      const pending = s.trades.find((t) => t.status === 'pending');
      if (pending && r() < 0.5) return { pid: pending.toId, action: { type: 'tradeRespond', tradeId: pending.id, accept: r() < 0.5 } };
      return { pid: cur.id, action: { type: 'endTurn' } };
    }
  }
  return null;
}

function playGame(seed: number, players: number, timeLimitMinutes = 0) {
  const r = seeded(seed);
  let now = 1_700_000_000_000;
  const ctx = (): Ctx => ({ now, rng: r });
  const s = createGame({ id: 'sim', code: 'SIMU', hostId: 'h', hostName: 'Host', now });
  for (let i = 1; i < players; i++) addPlayer(s, { id: `b${i}`, name: `Bot ${i}` }, now);
  applyAction(s, 'h', { type: 'configure', config: { timeLimitMinutes, inflationChance: 0.4 } }, ctx());
  for (const p of s.players) if (p.id !== 'h') applyAction(s, p.id, { type: 'setReady', ready: true }, ctx());
  applyAction(s, 'h', { type: 'start' }, ctx());
  let state = s;
  let steps = 0;
  let rejected = 0;
  while (state.status === 'playing' && steps < 20000) {
    steps++;
    now += 2000;
    const next = structuredClone(state);
    const a = botAction(next, r);
    try {
      if (a) applyAction(next, a.pid, a.action, ctx());
      else tick(next, ctx());
      state = next;
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      rejected++;
      now += 30_000;
      const t = structuredClone(state);
      tick(t, ctx());
      state = t;
    }
    invariants(state);
  }
  return { state, steps, rejected };
}

describe('full game simulation', () => {
  it('bots finish complete last-solvent games across many seeds', () => {
    let finished = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { state } = playGame(seed, 2 + (seed % 5));
      if (state.status === 'finished') {
        finished++;
        expect(state.winnerId).toBeTruthy();
        expect(state.players.filter((p) => !p.bankrupt)).toHaveLength(1);
        expect(state.finalWealth).toHaveLength(state.players.length);
      }
    }
    expect(finished).toBeGreaterThanOrEqual(20);
  });

  it('timed games end with a wealth ranking', () => {
    for (let seed = 100; seed < 105; seed++) {
      const { state } = playGame(seed, 4, 10);
      expect(state.status).toBe('finished');
      const w = state.finalWealth!;
      expect(w[0].playerId).toBe(state.winnerId);
    }
  });
});
