import { describe, expect, it } from 'vitest';
import { TestGame } from './helpers';
import { RULES } from '../src/shared/board';
import { creditLimit, rentFor, wealthOf } from '../src/shared/rules';
import { GameError } from '../src/shared/types';

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

describe('lobby', () => {
  it('requires 2 players and readiness, host only', () => {
    const g = new TestGame(2, { start: false });
    expectErr(() => g.act('p0', { type: 'start' }), 'err.notReady');
    expectErr(() => g.act('p1', { type: 'start' }), 'err.hostOnly');
    g.act('p1', { type: 'setReady', ready: true });
    g.act('p0', { type: 'start' });
    expect(g.s.status).toBe('playing');
    expect(g.s.players.every((p) => p.cash === 1500)).toBe(true);
  });

  it('validates configuration bounds', () => {
    const g = new TestGame(2, { start: false });
    expectErr(() => g.act('p0', { type: 'configure', config: { turnSeconds: 5 } }), 'err.badConfig');
    expectErr(() => g.act('p1', { type: 'configure', config: { turnSeconds: 60 } }), 'err.hostOnly');
    g.act('p0', { type: 'configure', config: { timeLimitMinutes: 30 } });
    expect(g.s.config.timeLimitMinutes).toBe(30);
  });

  it('enforces unique tokens', () => {
    const g = new TestGame(2, { start: false });
    expectErr(() => g.act('p1', { type: 'setToken', token: g.p('p0').token }), 'err.tokenTaken');
  });
});

describe('movement and Start', () => {
  it('moves by dice and resolves landing', () => {
    const g = new TestGame();
    g.rollFrom(0, 2, 3);
    expect(g.p('p0').position).toBe(5);
    expect(g.s.phase).toBe('awaitBuy');
  });

  it('pays salary and charges student loan when passing Start', () => {
    const g = new TestGame();
    g.rollFrom(38, 1, 2); // -> 1
    const p = g.p('p0');
    expect(p.position).toBe(1);
    expect(p.cash).toBe(1500 + 2000 - RULES.studentLoanPayment);
    expect(g.s.transactions.some((t) => t.reasonKey === 'reason.studentLoan')).toBe(true);
  });

  it('only the active player may roll; no double rolls', () => {
    const g = new TestGame();
    expectErr(() => g.act('p1', { type: 'roll' }), 'err.notYourTurn');
    g.rollFrom(0, 1, 2); // lands on 3 (property)
    expectErr(() => g.act('p0', { type: 'roll' }), 'err.wrongPhase');
  });

  it('doubles grant an extra roll; three doubles send you to jail', () => {
    const g = new TestGame();
    g.rollFrom(0, 1, 1); // 2 community chest -> card
    // resolve whatever the card did; force state back for clarity
    g.s.phase = g.s.phase === 'cardChoice' ? 'preRoll' : g.s.phase;
    g.s.debts = [];
    expect(g.s.doublesCount).toBe(1);
    g.p('p0').position = 12;
    g.own('p0', 12);
    g.s.phase = 'preRoll';
    g.rng.dice(2, 2);
    g.act('p0', { type: 'roll' }); // 16
    expect(g.s.doublesCount).toBe(2);
    g.own('p0', 16);
    g.s.phase = 'preRoll';
    g.rng.dice(3, 3);
    g.act('p0', { type: 'roll' });
    expect(g.p('p0').inJail).toBe(true);
    expect(g.p('p0').position).toBe(10);
    expect(g.s.phase).toBe('postRoll');
  });
});

describe('buying', () => {
  it('rejects purchase without funds and allows with funds', () => {
    const g = new TestGame();
    g.rollFrom(0, 1, 2); // 3 affordableSoldOut 2200
    expectErr(() => g.act('p0', { type: 'buy' }), 'err.insufficientFunds');
    g.p('p0').cash = 5000;
    g.act('p0', { type: 'buy' });
    expect(g.s.properties[3].ownerId).toBe('p0');
    expect(g.p('p0').cash).toBe(2800);
    expectErr(() => g.act('p0', { type: 'buy' }), 'err.wrongPhase');
  });

  it('charges luxury tax on premium property', () => {
    const g = new TestGame();
    g.p('p0').cash = 20000;
    g.rollFrom(34, 1, 2); // 37 tax haven 10000
    g.act('p0', { type: 'buy' });
    expect(g.p('p0').cash).toBe(20000 - 10000 - 1000);
    expect(g.s.economy.bailoutPot).toBe(500);
  });

  it('other players cannot buy on your behalf', () => {
    const g = new TestGame();
    g.rollFrom(0, 1, 2);
    expectErr(() => g.act('p1', { type: 'buy' }), 'err.notYourTurn');
  });
});

describe('rent', () => {
  it('charges base, group-doubled and upgraded rent', () => {
    const g = new TestGame();
    g.own('p1', 1);
    expect(rentFor(g.s, 1, 7, 'p0')).toBe(200);
    g.own('p1', 3);
    expect(rentFor(g.s, 1, 7, 'p0')).toBe(400);
    g.s.properties[1].upgrades = 1;
    expect(rentFor(g.s, 1, 7, 'p0')).toBe(600);
    g.s.properties[1].upgrades = 5;
    expect(rentFor(g.s, 1, 7, 'p0')).toBe(4800);
    g.s.properties[1].mortgaged = true;
    expect(rentFor(g.s, 1, 7, 'p0')).toBe(0);
  });

  it('infrastructure and utility rent scale with count', () => {
    const g = new TestGame();
    g.own('p1', 5);
    expect(rentFor(g.s, 5, 7, 'p0')).toBe(500);
    g.own('p1', 15, 25);
    expect(rentFor(g.s, 5, 7, 'p0')).toBe(2000);
    g.own('p1', 12);
    expect(rentFor(g.s, 12, 8, 'p0')).toBe(800);
    g.own('p1', 28);
    expect(rentFor(g.s, 12, 8, 'p0')).toBe(2000);
  });

  it('transfers rent between players and applies inflation and alliance discount', () => {
    const g = new TestGame();
    g.own('p1', 6);
    g.s.economy.rentMult = 1.25;
    g.rollFrom(0, 2, 4); // 6, base 260 *1.25 = 325 -> 330 (round10)
    expect(g.p('p1').cash).toBe(1500 + 330);
    expect(g.p('p0').cash).toBe(1500 - 330);
    g.s.alliances.push({ a: 'p0', b: 'p1', since: 1, expiresRound: 9 });
    expect(rentFor(g.s, 6, 7, 'p0')).toBe(260); // 325*0.8
  });
});

describe('taxes and bailout', () => {
  it('property tax uses holdings and feeds the bailout pot', () => {
    const g = new TestGame();
    g.own('p0', 1, 3);
    g.s.properties[1].upgrades = 1;
    g.rollFrom(1, 1, 2); // 4 property tax
    const expected = 150 + 2 * 100 + 50;
    expect(g.p('p0').cash).toBe(1500 - expected);
    expect(g.s.economy.bailoutPot).toBe(200);
  });

  it('government bailout pays out the pot', () => {
    const g = new TestGame();
    g.s.economy.bailoutPot = 700;
    g.rollFrom(15, 2, 3);
    expect(g.p('p0').cash).toBe(2200);
    expect(g.s.economy.bailoutPot).toBe(0);
  });
});

describe('auctions', () => {
  it('declining starts an auction won by the highest bidder', () => {
    const g = new TestGame(3);
    g.rollFrom(0, 1, 2);
    g.act('p0', { type: 'decline' });
    expect(g.s.phase).toBe('auction');
    g.act('p1', { type: 'bid', amount: 100 });
    expectErr(() => g.act('p2', { type: 'bid', amount: 150 }), 'err.bidTooLow');
    expectErr(() => g.act('p2', { type: 'bid', amount: 99990 }), 'err.insufficientFunds');
    g.act('p2', { type: 'bid', amount: 300 });
    g.act('p0', { type: 'passAuction' });
    g.act('p1', { type: 'passAuction' });
    expect(g.s.properties[3].ownerId).toBe('p2');
    expect(g.p('p2').cash).toBe(1200);
    expect(g.s.phase).toBe('postRoll');
  });

  it('auction ends on timer; no bids leaves property unowned', () => {
    const g = new TestGame();
    g.rollFrom(0, 1, 2);
    g.act('p0', { type: 'decline' });
    g.tick(16_000);
    expect(g.s.auction).toBeNull();
    expect(g.s.properties[3]).toBeUndefined();
    expect(g.s.phase).toBe('postRoll');
  });
});

describe('upgrades and mortgages', () => {
  it('requires full group and even building', () => {
    const g = new TestGame();
    g.own('p0', 1);
    g.p('p0').cash = 10000;
    expectErr(() => g.act('p0', { type: 'upgrade', space: 1 }), 'err.needGroup');
    g.own('p0', 3);
    g.act('p0', { type: 'upgrade', space: 1 });
    expect(g.p('p0').cash).toBe(9000);
    expectErr(() => g.act('p0', { type: 'upgrade', space: 1 }), 'err.buildEvenly');
    g.act('p0', { type: 'upgrade', space: 3 });
    expectErr(() => g.act('p0', { type: 'mortgage', space: 1 }), 'err.sellUpgradesFirst');
    g.act('p0', { type: 'sellUpgrade', space: 3 });
    expect(g.p('p0').cash).toBe(10000 - 1000 - 1100 + 550);
  });

  it('only on your own turn', () => {
    const g = new TestGame();
    g.own('p1', 1, 3);
    g.p('p1').cash = 10000;
    expectErr(() => g.act('p1', { type: 'upgrade', space: 1 }), 'err.notYourTurn');
  });

  it('mortgage and unmortgage', () => {
    const g = new TestGame();
    g.own('p0', 6);
    g.act('p0', { type: 'mortgage', space: 6 });
    expect(g.p('p0').cash).toBe(1500 + 1300);
    expectErr(() => g.act('p0', { type: 'mortgage', space: 6 }), 'err.alreadyMortgaged');
    expectErr(() => g.act('p1', { type: 'unmortgage', space: 6 }), 'err.notOwner');
    g.act('p0', { type: 'unmortgage', space: 6 });
    expect(g.p('p0').cash).toBe(2800 - 1430);
  });
});

describe('loans', () => {
  it('borrows within the credit limit and charges interest each turn', () => {
    const g = new TestGame();
    expect(creditLimit(g.s, 'p0')).toBe(2000);
    expectErr(() => g.act('p0', { type: 'borrow', amount: 2100 }), 'err.creditLimit');
    expectErr(() => g.act('p0', { type: 'borrow', amount: 150 }), 'err.badAmount');
    g.act('p0', { type: 'borrow', amount: 2000 });
    expect(g.p('p0').cash).toBe(3500);
    g.rollFrom(0, 1, 2);
    g.act('p0', { type: 'decline' });
    g.tick(16_000);
    g.act('p0', { type: 'endTurn' });
    g.rollFrom(0, 2, 4);
    g.act('p1', { type: 'decline' });
    g.tick(16_000);
    g.act('p1', { type: 'endTurn' });
    expect(g.p('p0').cash).toBe(3500 - 100); // 5% of 2000
    g.act('p0', { type: 'repay', amount: 2000 });
    expect(g.p('p0').loan).toBe(0);
  });
});

describe('jail / immigration court', () => {
  const jailed = () => {
    const g = new TestGame();
    g.rollFrom(25, 2, 3); // 30 -> go to jail
    expect(g.p('p0').inJail).toBe(true);
    g.act('p0', { type: 'endTurn' });
    g.rollFrom(0, 2, 4);
    if (g.s.phase === 'awaitBuy') g.act('p1', { type: 'decline' });
    g.tick(16_000);
    g.act('p1', { type: 'endTurn' });
    expect(g.cur.id).toBe('p0');
    return g;
  };

  it('cannot roll normally while in jail', () => {
    const g = jailed();
    expectErr(() => g.act('p0', { type: 'roll' }), 'err.inJail');
  });

  it('pay the legal fee to leave, then roll', () => {
    const g = jailed();
    g.act('p0', { type: 'jailPay' });
    expect(g.p('p0').inJail).toBe(false);
    expect(g.p('p0').cash).toBe(500);
    g.rng.dice(1, 2);
    g.act('p0', { type: 'roll' });
    expect(g.p('p0').position).toBe(13);
  });

  it('use a card', () => {
    const g = jailed();
    expectErr(() => g.act('p0', { type: 'jailCard' }), 'err.noJailCard');
    g.p('p0').jailCards = 1;
    g.act('p0', { type: 'jailCard' });
    expect(g.p('p0').inJail).toBe(false);
  });

  it('rolling 13+ never works and costs a jail turn', () => {
    const g = jailed();
    g.rng.dice(6, 6);
    g.act('p0', { type: 'jailRoll13' });
    expect(g.p('p0').inJail).toBe(true);
    expect(g.p('p0').jailTurns).toBe(1);
    expect(g.s.phase).toBe('postRoll');
  });

  it('citizenship test: pass releases, fail charges fee', async () => {
    const { QUIZ_ANSWERS } = await import('../src/shared/quizAnswers');
    const g = jailed();
    g.act('p0', { type: 'quizStart' });
    const ids = g.s.quiz!.questionIds;
    ids.forEach((id, i) => g.act('p0', { type: 'quizAnswer', index: i, answer: QUIZ_ANSWERS[id] }));
    expect(g.s.lastQuiz!.passed).toBe(true);
    expect(g.p('p0').inJail).toBe(false);
    expect(g.s.phase).toBe('preRoll');

    const g2 = jailed();
    g2.act('p0', { type: 'quizStart' });
    const ids2 = g2.s.quiz!.questionIds;
    ids2.forEach((id, i) => g2.act('p0', { type: 'quizAnswer', index: i, answer: (QUIZ_ANSWERS[id] + 1) % 3 }));
    expect(g2.s.lastQuiz!.passed).toBe(false);
    expect(g2.p('p0').inJail).toBe(true);
    expect(g2.p('p0').cash).toBe(1400);
    expectErr(() => g2.act('p0', { type: 'quizStart' }), 'err.wrongPhase');
  });

  it('guaranteed release after max turns', () => {
    const g = jailed();
    g.p('p0').jailTurns = RULES.jailMaxTurns;
    g.act('p0', { type: 'jailRoll13' });
    g.act('p0', { type: 'endTurn' });
    g.rollFrom(0, 2, 4);
    if (g.s.phase === 'awaitBuy') g.act('p1', { type: 'decline' });
    g.tick(16_000);
    g.act('p1', { type: 'endTurn' });
    expect(g.p('p0').inJail).toBe(false);
  });
});

describe('trades', () => {
  it('offers, validates and executes atomically', () => {
    const g = new TestGame();
    g.own('p0', 1);
    g.own('p1', 3);
    expectErr(() => g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 0, properties: [3], jailCards: 0 }, get: { cash: 0, properties: [], jailCards: 0 } }), 'err.tradeOwnership');
    expectErr(() => g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 99999, properties: [], jailCards: 0 }, get: { cash: 0, properties: [3], jailCards: 0 } }), 'err.tradeCash');
    g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 500, properties: [1], jailCards: 0 }, get: { cash: 0, properties: [3], jailCards: 0 } });
    const t = g.s.trades[0];
    expectErr(() => g.act('p0', { type: 'tradeRespond', tradeId: t.id, accept: true }), 'err.noTrade');
    g.act('p1', { type: 'tradeRespond', tradeId: t.id, accept: true });
    expect(g.s.properties[1].ownerId).toBe('p1');
    expect(g.s.properties[3].ownerId).toBe('p0');
    expect(g.p('p0').cash).toBe(1000);
    expect(g.p('p1').cash).toBe(2000);
    expectErr(() => g.act('p1', { type: 'tradeRespond', tradeId: t.id, accept: true }), 'err.tradeClosed');
  });

  it('re-validates on accept and supports counteroffers and expiry', () => {
    const g = new TestGame();
    g.own('p0', 1);
    g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 0, properties: [1], jailCards: 0 }, get: { cash: 1000, properties: [], jailCards: 0 } });
    const t = g.s.trades[0];
    g.p('p1').cash = 10;
    expectErr(() => g.act('p1', { type: 'tradeRespond', tradeId: t.id, accept: true }), 'err.tradeCash');
    g.p('p1').cash = 1500;
    g.act('p1', { type: 'tradeOffer', toId: 'p0', give: { cash: 800, properties: [], jailCards: 0 }, get: { cash: 0, properties: [1], jailCards: 0 }, counterOf: t.id });
    expect(g.s.trades[0].status).toBe('rejected');
    g.tick(61_000);
    expect(g.s.trades[1].status).toBe('expired');
  });

  it('blocks trading upgraded groups', () => {
    const g = new TestGame();
    g.own('p0', 1, 3);
    g.s.properties[3].upgrades = 1;
    expectErr(() => g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 0, properties: [1], jailCards: 0 }, get: { cash: 100, properties: [], jailCards: 0 } }), 'err.tradeUpgrades');
  });
});

describe('debt and bankruptcy', () => {
  it('records debt instead of negative cash, settles after mortgaging', () => {
    const g = new TestGame();
    g.own('p1', 39);
    g.s.properties[39].upgrades = 0;
    g.own('p0', 6);
    g.p('p0').cash = 100;
    g.rollFrom(35, 2, 2); // 39 rent 1200
    expect(g.p('p0').cash).toBe(100);
    expect(g.s.phase).toBe('debt');
    expect(g.s.debts[0]).toMatchObject({ debtorId: 'p0', creditor: 'p1', amount: 1200 });
    expectErr(() => g.act('p0', { type: 'settleDebt' }), 'err.insufficientFunds');
    expectErr(() => g.act('p0', { type: 'endTurn' }), 'err.wrongPhase');
    g.act('p0', { type: 'mortgage', space: 6 });
    g.act('p0', { type: 'borrow', amount: 2000 });
    g.act('p0', { type: 'settleDebt' });
    expect(g.s.debts).toHaveLength(0);
    expect(g.p('p1').cash).toBe(2700);
    expect(g.s.phase).toBe('preRoll'); // doubles -> extra roll resumes
  });

  it('bankruptcy to a player transfers assets; game ends with last solvent player', () => {
    const g = new TestGame();
    g.own('p1', 39);
    g.own('p0', 6);
    g.s.properties[6].mortgaged = true;
    g.p('p0').cash = 100;
    g.p('p0').loan = 2000; // no credit left
    g.rollFrom(35, 1, 3);
    expect(g.s.phase).toBe('debt');
    g.act('p0', { type: 'declareBankruptcy' });
    expect(g.p('p0').bankrupt).toBe(true);
    expect(g.s.properties[6].ownerId).toBe('p1');
    expect(g.p('p1').cash).toBe(1600);
    expect(g.s.status).toBe('finished');
    expect(g.s.winnerId).toBe('p1');
  });

  it('bankruptcy to the bank returns property for auction', () => {
    const g = new TestGame(3);
    g.own('p0', 1);
    g.p('p0').cash = 0;
    g.p('p0').loan = 2000;
    g.s.properties[1].mortgaged = true;
    g.rollFrom(36, 1, 1); // 38 emergency tax 500
    expect(g.s.phase).toBe('debt');
    g.act('p0', { type: 'declareBankruptcy' });
    expect(g.s.properties[1]).toBeUndefined();
    expect(g.s.status).toBe('playing');
    expect(g.cur.id).toBe('p1');
    expect(g.s.phase).toBe('auction');
    expect(g.s.auction!.space).toBe(1);
  });

  it('debt timeout auto-liquidates then bankrupts', () => {
    const g = new TestGame(3);
    g.own('p1', 39);
    g.own('p0', 6);
    g.p('p0').cash = 0;
    g.rollFrom(35, 1, 3);
    g.tick(61_000);
    // mortgage 1300 + borrow (2000) covers 1200
    expect(g.p('p0').bankrupt).toBe(false);
    expect(g.s.properties[6].mortgaged).toBe(true);
    expect(g.s.debts).toHaveLength(0);
  });

  it('cash never goes negative and debtors cannot gift assets', () => {
    const g = new TestGame();
    g.own('p1', 39);
    g.own('p0', 6);
    g.p('p0').cash = 100;
    g.rollFrom(35, 1, 3);
    expectErr(() => g.act('p0', { type: 'tradeOffer', toId: 'p1', give: { cash: 100, properties: [], jailCards: 0 }, get: { cash: 0, properties: [], jailCards: 0 } }), 'err.debtorTrade');
    expect(g.s.players.every((p) => p.cash >= 0)).toBe(true);
  });
});

describe('timed games', () => {
  it('ends at time limit with transparent wealth', () => {
    const g = new TestGame(2, { start: false });
    g.act('p0', { type: 'configure', config: { timeLimitMinutes: 1 } });
    g.start();
    g.own('p1', 39);
    g.p('p1').loan = 500;
    g.tick(61_000); // preRoll timeout rolls, but time is up at next stable phase
    for (let i = 0; i < 20 && g.s.status === 'playing'; i++) g.tick(100_000);
    expect(g.s.status).toBe('finished');
    const w = g.s.finalWealth!;
    expect(w[0].playerId).toBe(g.s.winnerId);
    const p1 = w.find((x) => x.playerId === 'p1')!;
    expect(p1.total).toBe(p1.cash + p1.propertyValue + p1.upgradeValue - p1.mortgageDebt - p1.loan);
    expect(wealthOf(g.s, g.p('p1')).propertyValue).toBeGreaterThanOrEqual(12000);
  });
});

describe('inflation', () => {
  it('respects grace period and caps', () => {
    const g = new TestGame(2, { start: false });
    g.act('p0', { type: 'configure', config: { inflationChance: 1 } });
    g.start();
    for (let r = 0; r < 60 && g.s.status === 'playing'; r++) {
      g.tick(100_000);
    }
    expect(g.s.economy.rentMult).toBeLessThanOrEqual(RULES.maxRentMult);
    expect(g.s.economy.loanRate).toBeLessThanOrEqual(RULES.maxLoanRate);
    const firstInflation = g.s.log.find((l) => l.key === 'log.inflation');
    const roundLogs = g.s.log.filter((l) => l.key === 'log.roundStart');
    if (firstInflation && roundLogs.length) {
      const before = roundLogs.filter((l) => l.seq < firstInflation.seq).pop();
      expect(Number(before?.params.round ?? 99)).toBeGreaterThan(RULES.inflationGraceRounds);
    }
  });
});

describe('disconnection policy', () => {
  it('autopilots after grace and forfeits after abandon timeout', async () => {
    const { setConnected } = await import('../src/shared/engine');
    const g = new TestGame(3);
    setConnected(g.s, 'p0', false, g.now);
    g.tick(30_000);
    expect(g.p('p0').bankrupt).toBe(false);
    g.tick(40_000); // past grace: autopilot kicks in shortly
    g.tick(10_000);
    expect(g.cur.id === 'p0' && g.s.phase === 'preRoll').toBe(false);
    g.tick(600_000);
    expect(g.p('p0').bankrupt).toBe(true);
    expect(g.p('p0').forfeited).toBe(true);
  });
});
