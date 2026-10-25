/**
 * Computer-player policy. Server-only: it reads quiz answers, which must
 * never reach the client bundle. Returns one move at a time; the server
 * paces them so humans can follow what the bots do.
 */
import { BOARD, GROUP_MEMBERS, RULES } from '../shared/board.js';
import { CARD_BY_ID, type CardEffect } from '../shared/cards.js';
import { QUIZ_ANSWERS } from '../shared/quizAnswers.js';
import {
  availableCredit, currentPrice, luxuryTax, mortgageBlocker, mortgageValue, ownedBy, sellUpgradeBlocker,
  unmortgageCost, upgradeBlocker, upgradeCost, wealthOf,
} from '../shared/rules.js';
import type { Action, GameState, Player, PlayerId, TradeSide } from '../shared/types.js';

export interface BotMove {
  playerId: PlayerId;
  action: Action;
}

/** Chance a bot answers a citizenship-test question correctly. */
const QUIZ_ACCURACY = 0.65;

/** Cash a bot tries to keep for rent and taxes. */
function reserve(s: GameState): number {
  return Math.max(300, Math.round(s.config.startingCash * 0.25));
}

/** How many of the space's color group (or kind) the player already owns. */
function groupShare(s: GameState, playerId: PlayerId, space: number): { owned: number; size: number } {
  const def = BOARD[space];
  const members = def.group ? GROUP_MEMBERS[def.group] : BOARD.filter((d) => d.kind === def.kind).map((d) => d.index);
  return { owned: members.filter((i) => s.properties[i]?.ownerId === playerId).length, size: members.length };
}

/** Rough worth of a space to a player: list price, more if it builds toward a set. */
function spaceValue(s: GameState, playerId: PlayerId, space: number): number {
  const { owned, size } = groupShare(s, playerId, space);
  const mine = s.properties[space]?.ownerId === playerId;
  const others = owned - (mine ? 1 : 0);
  const bonus = others === size - 1 ? 1.6 : others > 0 ? 1.2 : 1;
  return currentPrice(s, space) * bonus;
}

function sideValue(s: GameState, valuer: PlayerId, side: TradeSide): number {
  let v = side.cash + side.jailCards * RULES.jailFee * 0.5;
  for (const i of side.properties) {
    const o = s.properties[i];
    v += spaceValue(s, valuer, i) + (o?.upgrades ?? 0) * upgradeCost(s, i) * 0.5 - (o?.mortgaged ? mortgageValue(i) : 0);
  }
  return v;
}

function breaksMySet(s: GameState, playerId: PlayerId, side: TradeSide): boolean {
  return side.properties.some((i) => {
    const { owned, size } = groupShare(s, playerId, i);
    return owned === size && BOARD[i].kind === 'property';
  });
}

function debtMove(s: GameState, p: Player): Action {
  const d = s.debts.find((x) => x.debtorId === p.id)!;
  if (p.cash >= d.amount) return { type: 'settleDebt' };
  const owned = ownedBy(s, p.id);
  const sell = owned.find((i) => !sellUpgradeBlocker(s, p.id, i));
  if (sell !== undefined) return { type: 'sellUpgrade', space: sell };
  // Mortgage the least valuable holdings first.
  const mort = owned.filter((i) => !mortgageBlocker(s, p.id, i)).sort((a, b) => spaceValue(s, p.id, a) - spaceValue(s, p.id, b))[0];
  if (mort !== undefined) return { type: 'mortgage', space: mort };
  const short = Math.ceil((d.amount - p.cash) / RULES.loanStep) * RULES.loanStep;
  if (availableCredit(s, p) >= short) return { type: 'borrow', amount: short };
  return { type: 'declareBankruptcy' };
}

function auctionMove(s: GameState, bots: Player[]): BotMove | null {
  const a = s.auction;
  if (!a) return null;
  for (const b of bots) {
    if (a.passed.includes(b.id) || a.highBidderId === b.id) continue;
    const min = a.highBid > 0 ? a.highBid + RULES.auctionMinIncrement : RULES.auctionMinIncrement;
    const cap = Math.min(b.cash - reserve(s), spaceValue(s, b.id, a.space) * 0.9);
    if (min <= cap && !s.debts.some((d) => d.debtorId === b.id)) return { playerId: b.id, action: { type: 'bid', amount: min } };
    return { playerId: b.id, action: { type: 'passAuction' } };
  }
  return null;
}

function cardChoiceMove(s: GameState, p: Player): Action {
  const card = s.pendingCard ? CARD_BY_ID[s.pendingCard.cardId] : null;
  const choice = card?.effects.find((x) => x.kind === 'choice') as Extract<CardEffect, { kind: 'choice' }> | undefined;
  if (!choice) return { type: 'cardChoice', option: 0 };
  // Take the first option when its payments are affordable, otherwise the fallback (last) one.
  const cost = choice.options[0].effects.reduce((n, eff) => n + (eff.kind === 'pay' ? eff.amount * s.economy.costMult : 0), 0);
  return { type: 'cardChoice', option: p.cash - cost >= reserve(s) ? 0 : choice.options.length - 1 };
}

function preRollMove(s: GameState, p: Player): Action {
  if (!p.inJail) return { type: 'roll' };
  if (p.jailCards > 0) return { type: 'jailCard' };
  if (p.cash - RULES.jailFee >= reserve(s) * 2) return { type: 'jailPay' };
  if (!p.quizTakenThisTurn) return { type: 'quizStart' };
  return { type: 'jailRoll13' };
}

function awaitBuyMove(s: GameState, p: Player): Action {
  const cost = currentPrice(s, p.position) + luxuryTax(s, p.position);
  const { owned, size } = groupShare(s, p.id, p.position);
  const completesSet = owned === size - 1;
  const left = p.cash - cost;
  return { type: left >= reserve(s) || (completesSet && left >= 0) ? 'buy' : 'decline' };
}

function postRollMove(s: GameState, p: Player): Action {
  const r = reserve(s);
  const owned = ownedBy(s, p.id);
  const unmort = owned.find((i) => s.properties[i].mortgaged && p.cash - unmortgageCost(i) >= r * 2);
  if (unmort !== undefined) return { type: 'unmortgage', space: unmort };
  const up = owned
    .filter((i) => !upgradeBlocker(s, p.id, i) && p.cash - upgradeCost(s, i) >= r * 1.5)
    .sort((a, b) => upgradeCost(s, a) - upgradeCost(s, b))[0];
  if (up !== undefined) return { type: 'upgrade', space: up };
  if (p.loan > 0 && p.cash > r * 3) return { type: 'repay', amount: Math.min(p.loan, p.cash - r * 2) };
  return { type: 'endTurn' };
}

/** The next move any bot in the room wants to make, or null if no bot has anything to do. */
export function botMove(s: GameState, now: number, rng: () => number): BotMove | null {
  if (s.status !== 'playing') return null;
  const bots = s.players.filter((p) => p.bot && !p.bankrupt);
  if (!bots.length) return null;
  const isBot = (id: PlayerId) => bots.some((b) => b.id === id);

  for (const t of s.trades) {
    if (t.status !== 'pending' || now >= t.expiresAt || !isBot(t.toId)) continue;
    const gain = sideValue(s, t.toId, t.give) - sideValue(s, t.toId, t.get);
    const accept = gain >= 0.15 * sideValue(s, t.toId, t.get) && !breaksMySet(s, t.toId, t.get);
    return { playerId: t.toId, action: { type: 'tradeRespond', tradeId: t.id, accept } };
  }
  for (const a of s.allianceProposals) {
    if (!isBot(a.toId) || now >= a.expiresAt) continue;
    const me = s.players.find((p) => p.id === a.toId)!;
    const them = s.players.find((p) => p.id === a.fromId);
    // Team up with anyone who isn't clearly ahead.
    const accept = !!them && wealthOf(s, them).total <= wealthOf(s, me).total * 1.2;
    return { playerId: a.toId, action: { type: 'allianceRespond', fromId: a.fromId, accept } };
  }

  if (s.phase === 'debt') {
    const debtor = s.debts[0] && bots.find((b) => b.id === s.debts[0].debtorId);
    return debtor ? { playerId: debtor.id, action: debtMove(s, debtor) } : null;
  }
  if (s.phase === 'auction') return auctionMove(s, bots);

  const cur = s.players[s.current];
  if (!cur.bot || cur.bankrupt) return null;
  switch (s.phase) {
    case 'preRoll': return { playerId: cur.id, action: preRollMove(s, cur) };
    case 'awaitBuy': return { playerId: cur.id, action: awaitBuyMove(s, cur) };
    case 'cardChoice': return { playerId: cur.id, action: cardChoiceMove(s, cur) };
    case 'postRoll': return { playerId: cur.id, action: postRollMove(s, cur) };
    case 'quiz': {
      const q = s.quiz;
      if (!q || q.playerId !== cur.id) return null;
      const index = q.answers.findIndex((x) => x === null);
      if (index < 0) return null;
      const right = QUIZ_ANSWERS[q.questionIds[index]];
      const answer = rng() < QUIZ_ACCURACY ? right : (right + 1 + Math.floor(rng() * 2)) % 3;
      return { playerId: cur.id, action: { type: 'quizAnswer', index, answer } };
    }
    default:
      return null;
  }
}

/** What to do instead when the engine rejects a bot's move, so a bot never stalls the room. */
export function botFallback(s: GameState, move: BotMove): BotMove | null {
  const a = move.action;
  switch (a.type) {
    case 'tradeRespond': return a.accept ? { ...move, action: { ...a, accept: false } } : null;
    case 'bid': return { ...move, action: { type: 'passAuction' } };
    case 'buy': return { ...move, action: { type: 'decline' } };
    case 'jailPay': case 'jailCard': case 'quizStart': return { ...move, action: { type: 'jailRoll13' } };
    case 'unmortgage': case 'upgrade': case 'repay': return { ...move, action: { type: 'endTurn' } };
    case 'settleDebt': case 'sellUpgrade': case 'mortgage': case 'borrow':
      return s.debts.some((d) => d.debtorId === move.playerId) ? { ...move, action: { type: 'declareBankruptcy' } } : null;
    default: return null;
  }
}
