/**
 * Authoritative rules engine. Pure TypeScript, no I/O.
 *
 * The server calls applyAction()/tick() on a cloned state; if a GameError is
 * thrown, the clone is discarded, so a failed action never half-applies.
 * Randomness and time are injected through Ctx so tests are deterministic.
 */
import {
  BOARD, BOARD_SIZE, CONFIG_BOUNDS, DEFAULT_CONFIG, JAIL_INDEX, PLAYER_COLORS, RULES, TOKENS, isOwnable,
} from './board.js';
import { CARDS, CARD_BY_ID, type CardEffect, type Deck } from './cards.js';
import { INFLATION_EVENTS } from './inflation.js';
import { QUIZ } from './quiz.js';
import { QUIZ_ANSWERS } from './quizAnswers.js';
import {
  activePlayers, availableCredit, currentPrice, getPlayer, groupHasUpgrades, hasPendingDebt, loanInterest,
  luxuryTax, mortgageBlocker, mortgageValue, ownedBy, ownsDefense, propertyTax, rentFor, round10, scaled,
  sellUpgradeBlocker, unmortgageCost, upgradeBlocker, upgradeCost, upgradeRefund, wealthOf,
} from './rules.js';
import {
  GameError, type Action, type Creditor, type GameConfig, type GameEvent, type GameState, type Player,
  type PlayerId, type TradeSide, type TurnPhase, type Visibility,
} from './types.js';

export interface Ctx {
  now: number;
  /** Returns a float in [0, 1). */
  rng: () => number;
}

interface E {
  s: GameState;
  ctx: Ctx;
  ev: GameEvent[];
}

const fail = (code: string, params: Record<string, string | number> = {}): never => {
  throw new GameError(code, params);
};

// ───────────────────────── creation & lobby ─────────────────────────

export function createGame(opts: { id: string; code: string; hostId: PlayerId; hostName: string; now: number; visibility?: Visibility; testMode?: boolean }): GameState {
  const s: GameState = {
    id: opts.id,
    code: opts.code,
    hostId: opts.hostId,
    status: 'lobby',
    // Tester rooms are never listed publicly.
    visibility: opts.visibility === 'public' && !opts.testMode ? 'public' : 'private',
    ...(opts.testMode ? { testMode: true, testDice: [] } : {}),
    config: { ...DEFAULT_CONFIG },
    players: [],
    current: 0,
    round: 0,
    phase: 'preRoll',
    rolled: false,
    doublesCount: 0,
    extraRoll: false,
    lastDice: null,
    turnEndsAt: 0,
    properties: {},
    decks: { chance: [], community: [] },
    economy: { rentMult: 1, costMult: 1, priceMult: 1, loanRate: RULES.loanBaseRate, bailoutPot: 0 },
    debts: [],
    resumePhase: null,
    auction: null,
    auctionQueue: [],
    pendingCard: null,
    lastCard: null,
    quiz: null,
    lastQuiz: null,
    lastInflation: null,
    trades: [],
    alliances: [],
    allianceProposals: [],
    log: [],
    transactions: [],
    chat: [],
    seq: 0,
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    winnerId: null,
    finalWealth: null,
    processed: [],
    createdAt: opts.now,
    updatedAt: opts.now,
  };
  addPlayer(s, { id: opts.hostId, name: opts.hostName }, opts.now);
  return s;
}

export function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex -- strip control characters on purpose
  const clean = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return clean || 'Player';
}

/** Satirical names for computer players; skipped when already taken. */
export const BOT_NAMES = ['Landlord Larry', 'Crypto Kyle', 'Hedge Fund Hank', 'Lobbyist Lou', 'Austerity Anne', 'Influencer Ivy', 'Consultant Carl'];

/** Humans only: bots never host, never keep an empty room alive. */
export function humans(s: GameState) {
  return s.players.filter((p) => !p.bot);
}

export function addPlayer(s: GameState, info: { id: PlayerId; name: string; bot?: boolean }, now: number): void {
  if (getPlayer(s, info.id)) return; // already joined (reconnect)
  if (s.status !== 'lobby') fail('err.gameInProgress');
  if (s.players.length >= s.config.maxPlayers) fail('err.roomFull');
  const usedTokens = new Set(s.players.map((p) => p.token));
  const usedColors = new Set(s.players.map((p) => p.color));
  let name = sanitizeName(info.name);
  const names = new Set(s.players.map((p) => p.name.toLowerCase()));
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${sanitizeName(info.name).slice(0, 17)} ${n}`;
  s.players.push({
    id: info.id,
    name,
    token: TOKENS.find((t) => !usedTokens.has(t)) ?? TOKENS[0],
    color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0],
    cash: 0,
    loan: 0,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    ready: !!info.bot,
    connected: true,
    disconnectedAt: null,
    forfeited: false,
    quizTakenThisTurn: false,
    ...(info.bot ? { bot: true } : {}),
  });
  pushLog(s, now, 'log.joined', { p: info.id });
  s.updatedAt = now;
}

export function setConnected(s: GameState, playerId: PlayerId, connected: boolean, now: number): void {
  const p = getPlayer(s, playerId);
  if (!p || p.bot) return;
  if (p.connected === connected) return;
  p.connected = connected;
  p.disconnectedAt = connected ? null : now;
  s.updatedAt = now;
}

// ───────────────────────── logging & money ─────────────────────────

function pushLog(s: GameState, at: number, key: string, params: Record<string, string | number> = {}) {
  s.seq++;
  s.log.push({ seq: s.seq, at, key, params });
  if (s.log.length > RULES.logLimit) s.log.splice(0, s.log.length - RULES.logLimit);
}

function log(e: E, key: string, params: Record<string, string | number> = {}) {
  pushLog(e.s, e.ctx.now, key, params);
}

function tx(e: E, from: Creditor, to: Creditor | 'pot', amount: number, reasonKey: string) {
  if (amount <= 0) return;
  e.s.seq++;
  e.s.transactions.push({ seq: e.s.seq, at: e.ctx.now, round: e.s.round, from, to, amount, reasonKey });
  if (e.s.transactions.length > RULES.transactionLimit) e.s.transactions.splice(0, e.s.transactions.length - RULES.transactionLimit);
}

function mustPlayer(e: E, id: PlayerId): Player {
  return getPlayer(e.s, id) ?? fail('err.noPlayer');
}

function bankReceives(e: E, amount: number, toPot: boolean) {
  if (toPot) e.s.economy.bailoutPot += Math.floor((amount * RULES.potShareOfBankPayments) / 10) * 10;
}

/**
 * Charge a player. Pays immediately when cash suffices; otherwise records an
 * explicit Debt that must be settled or end in bankruptcy. Cash never goes negative.
 */
function charge(e: E, payerId: PlayerId, to: Creditor, amount: number, reasonKey: string, toPot = false): boolean {
  amount = Math.round(amount);
  if (amount <= 0) return true;
  const p = mustPlayer(e, payerId);
  if (p.bankrupt) return true;
  if (to !== 'bank' && (getPlayer(e.s, to)?.bankrupt ?? true)) to = 'bank';
  if (p.cash >= amount && !hasPendingDebt(e.s, p.id)) {
    transferNow(e, p, to, amount, reasonKey, toPot);
    return true;
  }
  e.s.debts.push({ debtorId: p.id, creditor: to, amount, reasonKey, toPot });
  if (to === 'bank') log(e, 'log.debtBank', { p: p.id, amount });
  else log(e, 'log.debt', { p: p.id, p2: to, amount });
  return false;
}

function transferNow(e: E, p: Player, to: Creditor, amount: number, reasonKey: string, toPot: boolean) {
  p.cash -= amount;
  if (to === 'bank') bankReceives(e, amount, toPot);
  else mustPlayer(e, to).cash += amount;
  tx(e, p.id, to, amount, reasonKey);
  e.ev.push({ type: 'pay', playerId: p.id, amount });
}

function bankPays(e: E, p: Player, amount: number, reasonKey: string) {
  amount = Math.round(amount);
  if (amount <= 0) return;
  p.cash += amount;
  tx(e, 'bank', p.id, amount, reasonKey);
  e.ev.push({ type: 'collect', playerId: p.id, amount });
}

// ───────────────────────── turn flow ─────────────────────────

function currentPlayer(s: GameState): Player {
  return s.players[s.current];
}

function stepSeconds(e: E, p: Player): number {
  const { config } = e.s;
  if (!p.connected && p.disconnectedAt !== null && e.ctx.now - p.disconnectedAt > config.reconnectGraceSeconds * 1000) {
    return RULES.autopilotTurnSeconds;
  }
  return config.turnSeconds;
}

function setPhase(e: E, phase: TurnPhase, seconds?: number) {
  e.s.phase = phase;
  e.s.turnEndsAt = e.ctx.now + (seconds ?? stepSeconds(e, currentPlayer(e.s))) * 1000;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollDie(e: E): number {
  return 1 + Math.floor(e.ctx.rng() * 6);
}

/** Two dice: preset ones first in tester rooms, random otherwise. */
function rollDice(e: E): [number, number] {
  const preset = e.s.testMode ? e.s.testDice?.shift() : undefined;
  return preset ?? [rollDie(e), rollDie(e)];
}

function startGame(e: E) {
  const { s } = e;
  s.players = shuffle(s.players, e.ctx.rng);
  for (const p of s.players) {
    p.cash = s.config.startingCash;
    p.position = 0;
    p.ready = true;
  }
  s.decks.chance = shuffle(CARDS.filter((c) => c.deck === 'chance').map((c) => c.id), e.ctx.rng);
  s.decks.community = shuffle(CARDS.filter((c) => c.deck === 'community').map((c) => c.id), e.ctx.rng);
  s.status = 'playing';
  s.round = 1;
  s.current = 0;
  s.startedAt = e.ctx.now;
  s.endsAt = s.config.timeLimitMinutes > 0 ? e.ctx.now + s.config.timeLimitMinutes * 60_000 : null;
  log(e, 'log.gameStarted', { n: s.players.length });
  beginTurn(e);
}

function beginTurn(e: E) {
  const { s } = e;
  const p = currentPlayer(s);
  s.rolled = false;
  s.doublesCount = 0;
  s.extraRoll = false;
  s.pendingCard = null;
  s.quiz = null;
  p.quizTakenThisTurn = false;
  setPhase(e, 'preRoll');
  log(e, 'log.turn', { p: p.id });
  if (p.inJail && p.jailTurns >= RULES.jailMaxTurns) {
    release(p);
    log(e, 'log.jailReleased', { p: p.id });
  }
  const interest = loanInterest(s, p);
  if (interest > 0) {
    log(e, 'log.interest', { p: p.id, amount: interest });
    charge(e, p.id, 'bank', interest, 'reason.interest');
  }
}

function advanceTurn(e: E) {
  const { s } = e;
  if (checkGameOver(e)) return;
  if (s.endsAt && e.ctx.now >= s.endsAt) {
    finishTimed(e);
    return;
  }
  const n = s.players.length;
  let i = s.current;
  let wrapped = false;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) wrapped = true;
    if (!s.players[i].bankrupt) break;
  }
  s.current = i;
  if (wrapped) {
    s.round++;
    startRound(e);
  }
  beginTurn(e);
}

function startRound(e: E) {
  const { s } = e;
  log(e, 'log.roundStart', { round: s.round });
  for (const a of s.alliances.filter((x) => x.expiresRound < s.round)) log(e, 'log.allianceExpired', { p: a.a, p2: a.b });
  s.alliances = s.alliances.filter((x) => x.expiresRound >= s.round);
  if (s.round > RULES.inflationGraceRounds && e.ctx.rng() < s.config.inflationChance) {
    const total = INFLATION_EVENTS.reduce((n, x) => n + x.weight, 0);
    let r = e.ctx.rng() * total;
    const evt = INFLATION_EVENTS.find((x) => (r -= x.weight) < 0) ?? INFLATION_EVENTS[0];
    const params = computeParams(s, null, evt.effects);
    s.lastInflation = { eventId: evt.id, round: s.round, params, seq: s.seq + 1 };
    log(e, 'log.inflation', { event: evt.id });
    e.ev.push({ type: 'inflation', eventId: evt.id });
    for (const eff of evt.effects) applyEffect(e, null, eff);
  }
}

/** After a landing (and anything it triggered) is fully resolved. */
function finishResolution(e: E) {
  const { s } = e;
  if (s.status !== 'playing') return;
  const p = currentPlayer(s);
  if (s.extraRoll && !p.inJail && !p.bankrupt) {
    s.rolled = false;
    setPhase(e, 'preRoll');
  } else {
    s.extraRoll = false;
    setPhase(e, 'postRoll');
  }
}

/** Enforces invariants after every action / tick: debts, auctions, bankrupt turns, game end. */
function normalize(e: E) {
  const { s } = e;
  for (let guard = 0; guard < 50 && s.status === 'playing'; guard++) {
    if (checkGameOver(e)) return;
    s.debts = s.debts.filter((d) => !mustPlayer(e, d.debtorId).bankrupt);
    for (const d of s.debts) if (d.creditor !== 'bank' && mustPlayer(e, d.creditor).bankrupt) d.creditor = 'bank';

    if (s.debts.length > 0) {
      if (s.phase !== 'debt') {
        s.resumePhase = s.phase;
        s.phase = 'debt';
        s.turnEndsAt = e.ctx.now + RULES.debtSeconds * 1000;
      }
      return;
    }
    if (s.phase === 'debt') {
      s.phase = s.resumePhase && s.resumePhase !== 'auction' ? s.resumePhase : 'postRoll';
      s.resumePhase = null;
      s.turnEndsAt = e.ctx.now + stepSeconds(e, currentPlayer(s)) * 1000;
      continue;
    }
    if (currentPlayer(s).bankrupt && s.phase !== 'auction') {
      s.pendingCard = null;
      s.quiz = null;
      advanceTurn(e);
      continue;
    }
    if ((s.phase === 'preRoll' || s.phase === 'postRoll') && !s.auction && s.auctionQueue.length > 0) {
      const space = s.auctionQueue.shift()!;
      if (!s.properties[space]) startAuction(e, space, s.phase);
      continue;
    }
    return;
  }
}

function checkGameOver(e: E): boolean {
  const { s } = e;
  if (s.status !== 'playing') return true;
  const active = activePlayers(s);
  if (active.length <= 1) {
    finishGame(e, active[0]?.id ?? null);
    return true;
  }
  return false;
}

function finishGame(e: E, winnerId: PlayerId | null) {
  const { s } = e;
  s.status = 'finished';
  s.finishedAt = e.ctx.now;
  s.winnerId = winnerId;
  s.auction = null;
  s.debts = [];
  s.finalWealth = s.players
    .map((p) => wealthOf(s, p))
    .sort((a, b) => {
      const pa = mustPlayer(e, a.playerId);
      const pb = mustPlayer(e, b.playerId);
      if (a.playerId === winnerId) return -1;
      if (b.playerId === winnerId) return 1;
      if (pa.bankrupt !== pb.bankrupt) return pa.bankrupt ? 1 : -1;
      if (pa.bankrupt && pb.bankrupt) return (pb.bankruptRound ?? 0) - (pa.bankruptRound ?? 0);
      return b.total - a.total;
    });
  for (const t of s.trades) if (t.status === 'pending') t.status = 'cancelled';
  log(e, winnerId ? 'log.gameOver' : 'log.gameOverNoWinner', winnerId ? { p: winnerId } : {});
  e.ev.push({ type: 'win', playerId: winnerId });
}

function finishTimed(e: E) {
  const { s } = e;
  log(e, 'log.timeUp');
  const ranked = activePlayers(s).map((p) => wealthOf(s, p)).sort((a, b) => b.total - a.total);
  finishGame(e, ranked[0]?.playerId ?? null);
}

// ───────────────────────── movement & landing ─────────────────────────

function passStart(e: E, p: Player) {
  bankPays(e, p, e.s.config.salary, 'reason.salary');
  log(e, 'log.salary', { p: p.id, amount: e.s.config.salary });
  log(e, 'log.studentLoan', { p: p.id, amount: RULES.studentLoanPayment });
  charge(e, p.id, 'bank', RULES.studentLoanPayment, 'reason.studentLoan');
}

function moveSteps(e: E, p: Player, steps: number) {
  const from = p.position;
  const to = (((from + steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  p.position = to;
  e.ev.push({ type: 'move', playerId: p.id, from, to, direct: false });
  if (steps > 0 && from + steps >= BOARD_SIZE) passStart(e, p);
}

function release(p: Player) {
  p.inJail = false;
  p.jailTurns = 0;
}

function sendToJail(e: E, p: Player) {
  const from = p.position;
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  e.ev.push({ type: 'move', playerId: p.id, from, to: JAIL_INDEX, direct: true });
  e.ev.push({ type: 'jail', playerId: p.id });
  log(e, 'log.jailed', { p: p.id });
  if (currentPlayer(e.s).id === p.id) {
    e.s.extraRoll = false;
  }
}

function diceSum(s: GameState): number {
  return s.lastDice ? s.lastDice[0] + s.lastDice[1] : 7;
}

function resolveLanding(e: E, p: Player, rentMult = 1) {
  const { s } = e;
  const def = BOARD[p.position];
  log(e, 'log.landed', { p: p.id, s: def.index });
  switch (def.kind) {
    case 'property':
    case 'infra':
    case 'utility': {
      const o = s.properties[def.index];
      if (!o) {
        setPhase(e, 'awaitBuy');
        return;
      }
      if (o.ownerId === p.id) break;
      if (o.mortgaged) {
        log(e, 'log.rentMortgaged', { p: p.id, s: def.index });
        break;
      }
      const rent = rentFor(s, def.index, diceSum(s), p.id, rentMult);
      log(e, 'log.rent', { p: p.id, p2: o.ownerId, amount: rent, s: def.index });
      e.ev.push({ type: 'rent', from: p.id, to: o.ownerId, amount: rent });
      charge(e, p.id, o.ownerId, rent, 'reason.rent');
      break;
    }
    case 'chance':
    case 'community':
      drawCard(e, p, def.kind);
      return;
    case 'propertyTax': {
      const t = propertyTax(s, p.id);
      log(e, 'log.propertyTax', { p: p.id, amount: t.total, base: t.base, props: t.perProperty, ups: t.perUpgrade });
      charge(e, p.id, 'bank', t.total, 'reason.propertyTax', true);
      break;
    }
    case 'emergencyTax': {
      const amount = scaled(s, RULES.emergencyTax);
      log(e, 'log.emergencyTax', { p: p.id, amount });
      charge(e, p.id, 'bank', amount, 'reason.emergencyTax', true);
      break;
    }
    case 'bailout': {
      const amount = s.economy.bailoutPot;
      s.economy.bailoutPot = 0;
      log(e, 'log.bailout', { p: p.id, amount });
      bankPays(e, p, amount, 'reason.bailout');
      break;
    }
    case 'goToJail':
      sendToJail(e, p);
      break;
    case 'start':
    case 'jail':
      break;
  }
  finishResolution(e);
}

// ───────────────────────── cards ─────────────────────────

/** Computes the display values for card text, matching what will be applied. */
export function computeParams(s: GameState, p: Player | null, effects: CardEffect[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const eff of effects) {
    switch (eff.kind) {
      case 'pay':
      case 'allPay':
        out[eff.p ?? 'amount'] = scaled(s, eff.amount);
        break;
      case 'collect': case 'payEach': case 'collectEach': case 'forgiveLoan': case 'addLoan': case 'transfer':
        out[eff.p ?? 'amount'] = eff.amount;
        break;
      case 'moveBy':
        out[eff.p ?? 'steps'] = Math.abs(eff.steps);
        break;
      case 'perAsset': {
        const owned = p ? ownedBy(s, p.id) : [];
        const ups = owned.reduce((n, i) => n + s.properties[i].upgrades, 0);
        const per = scaled(s, eff.perProperty);
        const perUp = scaled(s, eff.perUpgrade);
        out.per = per;
        out.perUp = perUp;
        out.amount = per * owned.length + perUp * ups;
        break;
      }
      case 'percentCash':
        out.pct = eff.pct;
        out.amount = p ? round10((p.cash * eff.pct) / 100) : 0;
        break;
      case 'potShare':
        out.pct = eff.pct;
        out.amount = Math.floor((s.economy.bailoutPot * eff.pct) / 100 / 10) * 10;
        break;
      case 'choice':
        for (const o of eff.options) Object.assign(out, computeParams(s, p, o.effects));
        break;
      default:
        break;
    }
  }
  return out;
}

function drawCard(e: E, p: Player, deck: Deck) {
  const { s } = e;
  if (s.decks[deck].length === 0) {
    s.decks[deck] = shuffle(CARDS.filter((c) => c.deck === deck).map((c) => c.id), e.ctx.rng);
  }
  const id = s.decks[deck].shift()!;
  s.decks[deck].push(id);
  const card = CARD_BY_ID[id];
  const params = computeParams(s, p, card.effects);
  s.lastCard = { cardId: id, playerId: p.id, seq: s.seq + 1, params };
  log(e, 'log.card', { p: p.id, card: id });
  e.ev.push({ type: 'card', playerId: p.id, cardId: id });
  if (card.effects.some((x) => x.kind === 'choice')) {
    s.pendingCard = { cardId: id, playerId: p.id };
    setPhase(e, 'cardChoice');
    return;
  }
  runEffects(e, p, card.effects);
}

/** Applies effects; resolves landing itself when an effect moves the player. */
function runEffects(e: E, p: Player, effects: CardEffect[]) {
  for (const eff of effects) {
    const moved = applyEffect(e, p, eff);
    if (moved) return; // movement effects are always last; landing resolution continues the turn
    if (p.inJail) break;
  }
  finishResolution(e);
}

function capEconomy(s: GameState) {
  const ec = s.economy;
  ec.rentMult = Math.min(RULES.maxRentMult, Math.round(ec.rentMult * 1000) / 1000);
  ec.costMult = Math.min(RULES.maxCostMult, Math.round(ec.costMult * 1000) / 1000);
  ec.priceMult = Math.min(RULES.maxPriceMult, Math.round(ec.priceMult * 1000) / 1000);
  ec.loanRate = Math.min(RULES.maxLoanRate, Math.round(ec.loanRate * 10000) / 10000);
}

/** Returns true when the player was moved and landing was resolved. p is null for global (inflation) effects. */
function applyEffect(e: E, p: Player | null, eff: CardEffect): boolean {
  const { s } = e;
  const active = activePlayers(s);
  switch (eff.kind) {
    case 'pay':
      if (p) charge(e, p.id, 'bank', scaled(s, eff.amount), 'reason.card', true);
      return false;
    case 'collect':
      if (p) bankPays(e, p, eff.amount, 'reason.card');
      return false;
    case 'payEach':
      if (p) for (const o of active) if (o.id !== p.id) charge(e, p.id, o.id, eff.amount, 'reason.card');
      return false;
    case 'collectEach':
      if (p) for (const o of active) if (o.id !== p.id) charge(e, o.id, p.id, eff.amount, 'reason.card');
      return false;
    case 'allPay': {
      const amount = scaled(s, eff.amount);
      for (const o of active) {
        if (eff.exemptDefense && ownsDefense(s, o.id)) {
          log(e, 'log.exempt', { p: o.id });
          continue;
        }
        charge(e, o.id, 'bank', amount, p ? 'reason.card' : 'reason.inflation', true);
      }
      return false;
    }
    case 'moveTo': {
      if (!p) return false;
      const steps = (eff.space - p.position + BOARD_SIZE) % BOARD_SIZE;
      moveSteps(e, p, steps === 0 ? BOARD_SIZE : steps);
      resolveLanding(e, p);
      return true;
    }
    case 'moveBy':
      if (!p) return false;
      moveSteps(e, p, eff.steps);
      resolveLanding(e, p);
      return true;
    case 'nearest': {
      if (!p) return false;
      let steps = 1;
      while (BOARD[(p.position + steps) % BOARD_SIZE].kind !== eff.target) steps++;
      moveSteps(e, p, steps);
      resolveLanding(e, p, eff.rentMult ?? 1);
      return true;
    }
    case 'goToJail':
      if (p) sendToJail(e, p);
      return false;
    case 'jailCard':
      if (p) p.jailCards++;
      return false;
    case 'perAsset': {
      if (!p) return false;
      const amount = Number(computeParams(s, p, [eff]).amount);
      charge(e, p.id, 'bank', amount, 'reason.card', true);
      return false;
    }
    case 'percentCash': {
      if (!p) return false;
      charge(e, p.id, 'bank', round10((p.cash * eff.pct) / 100), 'reason.card', true);
      return false;
    }
    case 'economy': {
      s.economy[eff.field] *= eff.factor;
      capEconomy(s);
      log(e, 'log.economy', { field: eff.field, value: s.economy[eff.field] });
      return false;
    }
    case 'transfer': {
      if (active.length < 2) return false;
      const byCash = [...active].sort((a, b) => b.cash - a.cash);
      const richest = byCash[0];
      const poorest = byCash[byCash.length - 1];
      if (richest.id === poorest.id || richest.cash === poorest.cash) {
        log(e, 'log.transferTie');
        return false;
      }
      if (eff.from === 'richest') charge(e, richest.id, poorest.id, eff.amount, 'reason.card');
      else charge(e, poorest.id, richest.id, eff.amount, 'reason.card');
      return false;
    }
    case 'potShare': {
      if (!p) return false;
      const amount = Math.floor((s.economy.bailoutPot * eff.pct) / 100 / 10) * 10;
      s.economy.bailoutPot -= amount;
      bankPays(e, p, amount, 'reason.bailout');
      return false;
    }
    case 'forgiveLoan': {
      if (!p) return false;
      const amount = Math.min(p.loan, eff.amount);
      p.loan -= amount;
      log(e, 'log.loanForgiven', { p: p.id, amount });
      return false;
    }
    case 'addLoan':
      if (!p) return false;
      p.loan += eff.amount;
      log(e, 'log.loanAdded', { p: p.id, amount: eff.amount });
      return false;
    case 'inherit': {
      if (!p) return false;
      const free = BOARD.filter((d) => isOwnable(d) && !s.properties[d.index]);
      if (free.length === 0) {
        bankPays(e, p, eff.fallbackCash, 'reason.card');
        return false;
      }
      const space = free[Math.floor(e.ctx.rng() * free.length)].index;
      s.properties[space] = { ownerId: p.id, upgrades: 0, mortgaged: false };
      log(e, 'log.inherit', { p: p.id, s: space });
      e.ev.push({ type: 'buy', playerId: p.id, space });
      return false;
    }
    case 'choice':
      return false; // handled through pendingCard
  }
}

// ───────────────────────── auctions ─────────────────────────

function startAuction(e: E, space: number, returnPhase: TurnPhase | 'finish') {
  const { s } = e;
  s.auction = {
    space,
    highBid: 0,
    highBidderId: null,
    passed: [],
    endsAt: e.ctx.now + s.config.auctionSeconds * 1000,
    returnPhase,
  };
  s.phase = 'auction';
  log(e, 'log.auctionStart', { s: space });
  e.ev.push({ type: 'auction', space });
}

function auctionShouldEnd(s: GameState): boolean {
  const a = s.auction!;
  return activePlayers(s).every((p) => a.passed.includes(p.id) || p.id === a.highBidderId);
}

function endAuction(e: E) {
  const { s } = e;
  const a = s.auction!;
  s.auction = null;
  const winner = a.highBidderId ? getPlayer(s, a.highBidderId) : undefined;
  if (winner && !winner.bankrupt && !s.properties[a.space]) {
    s.properties[a.space] = { ownerId: winner.id, upgrades: 0, mortgaged: false };
    log(e, 'log.auctionWon', { p: winner.id, s: a.space, amount: a.highBid });
    e.ev.push({ type: 'buy', playerId: winner.id, space: a.space });
    charge(e, winner.id, 'bank', a.highBid, 'reason.auction');
  } else {
    log(e, 'log.auctionNoBids', { s: a.space });
  }
  if (a.returnPhase === 'finish') finishResolution(e);
  else setPhase(e, a.returnPhase);
}

// ───────────────────────── jail & quiz ─────────────────────────

function finalizeQuiz(e: E) {
  const { s } = e;
  const q = s.quiz!;
  const p = mustPlayer(e, q.playerId);
  const correct = q.questionIds.map((id, i) => q.answers[i] === QUIZ_ANSWERS[id]);
  const passed = correct.every(Boolean);
  s.quiz = null;
  s.lastQuiz = { playerId: p.id, questionIds: q.questionIds, answers: q.answers, correct, passed, seq: s.seq + 1 };
  if (passed) {
    release(p);
    log(e, 'log.quizPassed', { p: p.id });
    setPhase(e, 'preRoll');
  } else {
    p.jailTurns++;
    const fee = scaled(s, RULES.quizFailFee);
    log(e, 'log.quizFailed', { p: p.id, amount: fee });
    s.rolled = true;
    setPhase(e, 'postRoll');
    charge(e, p.id, 'bank', fee, 'reason.quizFee', true);
  }
}

// ───────────────────────── debt & bankruptcy ─────────────────────────

function goBankrupt(e: E, p: Player, creditor: Creditor) {
  const { s } = e;
  const owned = ownedBy(s, p.id);
  for (const i of owned) {
    const o = s.properties[i];
    if (o.upgrades > 0) {
      p.cash += upgradeRefund(i) * o.upgrades;
      o.upgrades = 0;
    }
  }
  const c = creditor !== 'bank' ? getPlayer(s, creditor) : undefined;
  if (c && !c.bankrupt) {
    if (p.cash > 0) {
      c.cash += p.cash;
      tx(e, p.id, c.id, p.cash, 'reason.bankruptcy');
    }
    for (const i of owned) s.properties[i].ownerId = c.id;
    c.jailCards += p.jailCards;
    log(e, 'log.bankrupt', { p: p.id, p2: c.id });
  } else {
    if (p.cash > 0) tx(e, p.id, 'bank', p.cash, 'reason.bankruptcy');
    for (const i of owned) {
      delete s.properties[i];
      s.auctionQueue.push(i);
    }
    log(e, 'log.bankruptBank', { p: p.id });
  }
  if (p.loan > 0) log(e, 'log.loanWrittenOff', { p: p.id, amount: p.loan });
  p.cash = 0;
  p.loan = 0;
  p.jailCards = 0;
  p.inJail = false;
  p.bankrupt = true;
  p.bankruptRound = s.round;
  s.debts = s.debts.filter((d) => d.debtorId !== p.id);
  for (const d of s.debts) if (d.creditor === p.id) d.creditor = 'bank';
  for (const t of s.trades) if (t.status === 'pending' && (t.fromId === p.id || t.toId === p.id)) t.status = 'invalid';
  s.alliances = s.alliances.filter((a) => a.a !== p.id && a.b !== p.id);
  s.allianceProposals = s.allianceProposals.filter((a) => a.fromId !== p.id && a.toId !== p.id);
  if (s.auction) {
    if (s.auction.highBidderId === p.id) {
      s.auction.highBidderId = null;
      s.auction.highBid = 0;
    }
    if (activePlayers(s).every((x) => s.auction!.passed.includes(x.id) || x.id === s.auction!.highBidderId)) endAuction(e);
  }
  if (s.quiz?.playerId === p.id) s.quiz = null;
  if (s.pendingCard?.playerId === p.id) s.pendingCard = null;
  e.ev.push({ type: 'bankrupt', playerId: p.id });
}

function settleFirstDebt(e: E, p: Player): boolean {
  const { s } = e;
  const idx = s.debts.findIndex((d) => d.debtorId === p.id);
  if (idx < 0) return false;
  const d = s.debts[idx];
  if (p.cash < d.amount) return false;
  s.debts.splice(idx, 1);
  let to = d.creditor;
  if (to !== 'bank' && mustPlayer(e, to).bankrupt) to = 'bank';
  transferNow(e, p, to, d.amount, d.reasonKey, !!d.toPot);
  log(e, 'log.debtSettled', { p: p.id, amount: d.amount });
  return true;
}

/** Timeout fallback: sell upgrades, mortgage, borrow; bankrupt if still short. */
function autoLiquidate(e: E, p: Player) {
  const { s } = e;
  log(e, 'log.autoLiquidate', { p: p.id });
  for (let guard = 0; guard < 200; guard++) {
    const d = s.debts.find((x) => x.debtorId === p.id);
    if (!d) return;
    if (p.cash >= d.amount) {
      settleFirstDebt(e, p);
      continue;
    }
    const owned = ownedBy(s, p.id);
    const sellable = owned.filter((i) => !sellUpgradeBlocker(s, p.id, i)).sort((a, b) => upgradeRefund(b) - upgradeRefund(a))[0];
    if (sellable !== undefined) {
      doSellUpgrade(e, p, sellable);
      continue;
    }
    const mortgageable = owned.filter((i) => !mortgageBlocker(s, p.id, i)).sort((a, b) => mortgageValue(a) - mortgageValue(b))[0];
    if (mortgageable !== undefined) {
      doMortgage(e, p, mortgageable);
      continue;
    }
    const credit = availableCredit(s, p);
    if (credit >= RULES.loanStep) {
      const need = Math.ceil((d.amount - p.cash) / RULES.loanStep) * RULES.loanStep;
      doBorrow(e, p, Math.min(credit, need));
      continue;
    }
    goBankrupt(e, p, d.creditor);
    return;
  }
}

// ───────────────────────── asset management ─────────────────────────

function doSellUpgrade(e: E, p: Player, space: number) {
  const b = sellUpgradeBlocker(e.s, p.id, space);
  if (b) fail(b);
  const refund = upgradeRefund(space);
  e.s.properties[space].upgrades--;
  bankPays(e, p, refund, 'reason.sellUpgrade');
  log(e, 'log.sellUpgrade', { p: p.id, s: space, amount: refund });
}

function doMortgage(e: E, p: Player, space: number) {
  const b = mortgageBlocker(e.s, p.id, space);
  if (b) fail(b);
  e.s.properties[space].mortgaged = true;
  const v = mortgageValue(space);
  bankPays(e, p, v, 'reason.mortgage');
  log(e, 'log.mortgage', { p: p.id, s: space, amount: v });
}

function doBorrow(e: E, p: Player, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0 || amount % RULES.loanStep !== 0) fail('err.badAmount');
  if (amount > availableCredit(e.s, p)) fail('err.creditLimit');
  p.loan += amount;
  bankPays(e, p, amount, 'reason.loan');
  log(e, 'log.borrow', { p: p.id, amount });
}

// ───────────────────────── trades ─────────────────────────

function validateSide(e: E, owner: Player, side: TradeSide) {
  const { s } = e;
  if (!side || typeof side !== 'object') fail('err.badTrade');
  if (!Number.isInteger(side.cash) || side.cash < 0) fail('err.badAmount');
  if (!Number.isInteger(side.jailCards) || side.jailCards < 0) fail('err.badAmount');
  if (!Array.isArray(side.properties) || side.properties.length > 28) fail('err.badTrade');
  if (new Set(side.properties).size !== side.properties.length) fail('err.badTrade');
  if (side.cash > owner.cash) fail('err.tradeCash', { p: owner.id });
  if (side.jailCards > owner.jailCards) fail('err.tradeJailCards');
  for (const i of side.properties) {
    if (!Number.isInteger(i) || !BOARD[i] || s.properties[i]?.ownerId !== owner.id) fail('err.tradeOwnership');
    if (groupHasUpgrades(s, i)) fail('err.tradeUpgrades');
  }
}

function sideEmpty(t: TradeSide) {
  return t.cash === 0 && t.properties.length === 0 && t.jailCards === 0;
}

function assertDebtorTradeOk(e: E, p: Player, gives: TradeSide, gets: TradeSide) {
  // Anti-evasion: a debtor may not gift assets away; selling property for cash is allowed.
  if (!hasPendingDebt(e.s, p.id)) return;
  if (gives.cash > 0 || gives.jailCards > 0) fail('err.debtorTrade');
  if (gives.properties.length > 0 && gets.cash <= 0) fail('err.debtorTrade');
}

function executeTrade(e: E, from: Player, to: Player, give: TradeSide, get: TradeSide) {
  const { s } = e;
  const move = (a: Player, b: Player, side: TradeSide) => {
    if (side.cash > 0) {
      a.cash -= side.cash;
      b.cash += side.cash;
      tx(e, a.id, b.id, side.cash, 'reason.trade');
    }
    a.jailCards -= side.jailCards;
    b.jailCards += side.jailCards;
    for (const i of side.properties) s.properties[i].ownerId = b.id;
  };
  move(from, to, give);
  move(to, from, get);
}

// ───────────────────────── public API ─────────────────────────

export function applyAction(s: GameState, playerId: PlayerId, action: Action, ctx: Ctx): GameEvent[] {
  const e: E = { s, ctx, ev: [] };
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') fail('err.badAction');
  const p = getPlayer(s, playerId) ?? fail('err.notInRoom');

  if (action.type === 'chat') {
    // eslint-disable-next-line no-control-regex -- strip control characters on purpose
    const text = String(action.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, RULES.chatMaxLength);
    if (!text) fail('err.emptyMessage');
    s.chat.push({ id: `${ctx.now.toString(36)}-${s.seq + 1}`, at: ctx.now, playerId, text });
    s.seq++;
    if (s.chat.length > RULES.chatLimit) s.chat.splice(0, s.chat.length - RULES.chatLimit);
    e.ev.push({ type: 'chat', playerId });
    s.updatedAt = ctx.now;
    return e.ev;
  }

  if (s.status === 'lobby') {
    lobbyAction(e, p, action);
    s.updatedAt = ctx.now;
    return e.ev;
  }
  if (s.status !== 'playing') fail('err.gameOver');
  if (p.bankrupt) fail('err.bankrupt');

  if (action.type.startsWith('test')) testAction(e, p, action);
  else gameAction(e, p, action);
  normalize(e);
  s.updatedAt = ctx.now;
  return e.ev;
}

function lobbyAction(e: E, p: Player, action: Action) {
  const { s } = e;
  switch (action.type) {
    case 'setReady':
      p.ready = !!action.ready;
      return;
    case 'setToken': {
      if (!TOKENS.includes(action.token)) fail('err.badToken');
      if (s.players.some((o) => o.id !== p.id && o.token === action.token)) fail('err.tokenTaken');
      p.token = action.token;
      return;
    }
    case 'configure': {
      if (p.id !== s.hostId) fail('err.hostOnly');
      const next: GameConfig = { ...s.config };
      for (const [k, v] of Object.entries(action.config ?? {})) {
        const key = k as keyof GameConfig;
        const bounds = CONFIG_BOUNDS[key];
        if (!bounds) fail('err.badConfig', { key: k });
        if (typeof v !== 'number' || !Number.isFinite(v) || v < bounds[0] || v > bounds[1]) fail('err.badConfig', { key: k });
        next[key] = key === 'inflationChance' ? v : Math.round(v);
      }
      if (next.maxPlayers < s.players.length) fail('err.badConfig', { key: 'maxPlayers' });
      s.config = next;
      for (const o of s.players) if (o.id !== s.hostId && !o.bot) o.ready = false;
      return;
    }
    case 'setVisibility': {
      if (p.id !== s.hostId) fail('err.hostOnly');
      if (action.visibility !== 'public' && action.visibility !== 'private') fail('err.badAction');
      if (s.testMode && action.visibility === 'public') fail('err.testerPrivate');
      s.visibility = action.visibility;
      return;
    }
    case 'addBot': {
      if (p.id !== s.hostId) fail('err.hostOnly');
      const taken = new Set(s.players.map((o) => o.name));
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? 'Bot';
      addPlayer(s, { id: `bot_${(s.seq + 1).toString(36)}${Math.floor(e.ctx.rng() * 1e6).toString(36)}`, name, bot: true }, e.ctx.now);
      return;
    }
    case 'removeBot': {
      if (p.id !== s.hostId) fail('err.hostOnly');
      const bot = s.players.find((o) => o.id === action.playerId && o.bot);
      if (!bot) fail('err.noPlayer');
      s.players = s.players.filter((o) => o !== bot);
      log(e, 'log.left', { p: bot!.id });
      return;
    }
    case 'start': {
      if (p.id !== s.hostId) fail('err.hostOnly');
      if (s.players.length < 2) fail('err.needPlayers');
      if (s.players.some((o) => o.id !== s.hostId && !o.ready)) fail('err.notReady');
      startGame(e);
      normalize(e);
      return;
    }
    case 'leave': {
      s.players = s.players.filter((o) => o.id !== p.id);
      log(e, 'log.left', { p: p.id });
      const rest = humans(s);
      // Bots alone don't keep a lobby: the server deletes the empty room.
      if (rest.length === 0) s.players = [];
      else if (s.hostId === p.id) {
        s.hostId = (rest.find((o) => o.connected) ?? rest[0]).id;
        log(e, 'log.hostChanged', { p: s.hostId });
      }
      return;
    }
    default:
      fail('err.notStarted');
  }
}

function assertTurn(e: E, p: Player, phases: TurnPhase[]) {
  if (currentPlayer(e.s).id !== p.id) fail('err.notYourTurn');
  if (!phases.includes(e.s.phase)) fail('err.wrongPhase', { phase: e.s.phase });
}

function assertCanSpend(e: E, p: Player) {
  if (hasPendingDebt(e.s, p.id)) fail('err.settleDebtFirst');
}

function gameAction(e: E, p: Player, action: Action) {
  const { s } = e;
  switch (action.type) {
    case 'roll': {
      assertTurn(e, p, ['preRoll']);
      if (p.inJail) fail('err.inJail');
      const d = rollDice(e);
      s.lastDice = d;
      s.rolled = true;
      e.ev.push({ type: 'dice', playerId: p.id, dice: d });
      log(e, 'log.rolled', { p: p.id, d1: d[0], d2: d[1] });
      const doubles = d[0] === d[1];
      if (doubles) {
        s.doublesCount++;
        if (s.doublesCount >= 3) {
          log(e, 'log.threeDoubles', { p: p.id });
          sendToJail(e, p);
          s.extraRoll = false;
          setPhase(e, 'postRoll');
          return;
        }
        log(e, 'log.doubles', { p: p.id });
      }
      s.extraRoll = doubles;
      moveSteps(e, p, d[0] + d[1]);
      resolveLanding(e, p);
      return;
    }
    case 'buy': {
      assertTurn(e, p, ['awaitBuy']);
      assertCanSpend(e, p);
      const space = p.position;
      if (s.properties[space]) fail('err.alreadyOwned');
      const price = currentPrice(s, space);
      const lux = luxuryTax(s, space);
      if (p.cash < price + lux) fail('err.insufficientFunds', { amount: price + lux });
      p.cash -= price + lux;
      tx(e, p.id, 'bank', price, 'reason.purchase');
      if (lux > 0) {
        tx(e, p.id, 'bank', lux, 'reason.luxuryTax');
        bankReceives(e, lux, true);
      }
      s.properties[space] = { ownerId: p.id, upgrades: 0, mortgaged: false };
      log(e, 'log.bought', { p: p.id, s: space, amount: price, lux });
      e.ev.push({ type: 'buy', playerId: p.id, space });
      finishResolution(e);
      return;
    }
    case 'decline': {
      assertTurn(e, p, ['awaitBuy']);
      log(e, 'log.declined', { p: p.id, s: p.position });
      startAuction(e, p.position, 'finish');
      return;
    }
    case 'bid': {
      const a = s.auction;
      if (s.phase !== 'auction' || !a) fail('err.noAuction');
      if (a!.passed.includes(p.id)) fail('err.passedAuction');
      if (a!.highBidderId === p.id) fail('err.alreadyHighest');
      assertCanSpend(e, p);
      const min = a!.highBid > 0 ? a!.highBid + RULES.auctionMinIncrement : RULES.auctionMinIncrement;
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount < min || amount % 10 !== 0) fail('err.bidTooLow', { amount: min });
      if (amount > p.cash) fail('err.insufficientFunds', { amount });
      a!.highBid = amount;
      a!.highBidderId = p.id;
      a!.endsAt = Math.max(a!.endsAt, e.ctx.now + 6000);
      log(e, 'log.bid', { p: p.id, amount, s: a!.space });
      if (auctionShouldEnd(s)) endAuction(e);
      return;
    }
    case 'passAuction': {
      const a = s.auction;
      if (s.phase !== 'auction' || !a) fail('err.noAuction');
      if (!a!.passed.includes(p.id)) a!.passed.push(p.id);
      if (auctionShouldEnd(s)) endAuction(e);
      return;
    }
    case 'cardChoice': {
      assertTurn(e, p, ['cardChoice']);
      const pc = s.pendingCard;
      if (!pc || pc.playerId !== p.id) fail('err.noCard');
      const card = CARD_BY_ID[pc!.cardId];
      const choice = card.effects.find((x) => x.kind === 'choice');
      if (!choice || choice.kind !== 'choice') fail('err.noCard');
      const opt = (choice as Extract<CardEffect, { kind: 'choice' }>).options[action.option];
      if (!opt) fail('err.badOption');
      s.pendingCard = null;
      log(e, 'log.cardChoice', { p: p.id, card: card.id, option: action.option });
      runEffects(e, p, opt.effects);
      return;
    }
    case 'endTurn': {
      assertTurn(e, p, ['postRoll']);
      advanceTurn(e);
      return;
    }
    // ── jail ──
    case 'jailPay': {
      assertTurn(e, p, ['preRoll']);
      if (!p.inJail) fail('err.notInJail');
      assertCanSpend(e, p);
      if (p.cash < RULES.jailFee) fail('err.insufficientFunds', { amount: RULES.jailFee });
      transferNow(e, p, 'bank', RULES.jailFee, 'reason.jailFee', true);
      release(p);
      log(e, 'log.jailPaid', { p: p.id, amount: RULES.jailFee });
      setPhase(e, 'preRoll');
      return;
    }
    case 'jailCard': {
      assertTurn(e, p, ['preRoll']);
      if (!p.inJail) fail('err.notInJail');
      if (p.jailCards <= 0) fail('err.noJailCard');
      p.jailCards--;
      release(p);
      log(e, 'log.jailCardUsed', { p: p.id });
      setPhase(e, 'preRoll');
      return;
    }
    case 'jailRoll13': {
      assertTurn(e, p, ['preRoll']);
      if (!p.inJail) fail('err.notInJail');
      const d = rollDice(e);
      s.lastDice = d;
      s.rolled = true;
      e.ev.push({ type: 'dice', playerId: p.id, dice: d });
      p.jailTurns++;
      log(e, 'log.jailRoll13', { p: p.id, d1: d[0], d2: d[1], sum: d[0] + d[1] });
      setPhase(e, 'postRoll');
      return;
    }
    case 'quizStart': {
      assertTurn(e, p, ['preRoll']);
      if (!p.inJail) fail('err.notInJail');
      if (p.quizTakenThisTurn) fail('err.quizTaken');
      p.quizTakenThisTurn = true;
      const ids = shuffle(QUIZ.map((q) => q.id), e.ctx.rng).slice(0, RULES.quizQuestions);
      s.quiz = { playerId: p.id, questionIds: ids, answers: ids.map(() => null) };
      setPhase(e, 'quiz', RULES.quizSeconds);
      log(e, 'log.quizStart', { p: p.id });
      return;
    }
    case 'quizAnswer': {
      assertTurn(e, p, ['quiz']);
      const q = s.quiz;
      if (!q || q.playerId !== p.id) fail('err.noQuiz');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= q!.questionIds.length) fail('err.badOption');
      if (!Number.isInteger(action.answer) || action.answer < 0 || action.answer > 2) fail('err.badOption');
      if (q!.answers[action.index] !== null) fail('err.alreadyAnswered');
      q!.answers[action.index] = action.answer;
      if (q!.answers.every((a) => a !== null)) finalizeQuiz(e);
      return;
    }
    // ── assets ──
    case 'upgrade': {
      assertTurn(e, p, ['preRoll', 'postRoll']);
      assertCanSpend(e, p);
      const b = upgradeBlocker(s, p.id, action.space);
      if (b) fail(b);
      const cost = upgradeCost(s, action.space);
      if (p.cash < cost) fail('err.insufficientFunds', { amount: cost });
      p.cash -= cost;
      tx(e, p.id, 'bank', cost, 'reason.upgrade');
      s.properties[action.space].upgrades++;
      log(e, 'log.upgrade', { p: p.id, s: action.space, level: s.properties[action.space].upgrades, amount: cost });
      e.ev.push({ type: 'buy', playerId: p.id, space: action.space });
      return;
    }
    case 'sellUpgrade':
      doSellUpgrade(e, p, action.space);
      return;
    case 'mortgage':
      doMortgage(e, p, action.space);
      return;
    case 'unmortgage': {
      assertCanSpend(e, p);
      const o = s.properties[action.space];
      if (!o || o.ownerId !== p.id) fail('err.notOwner');
      if (!o!.mortgaged) fail('err.notMortgaged');
      const cost = unmortgageCost(action.space);
      if (p.cash < cost) fail('err.insufficientFunds', { amount: cost });
      p.cash -= cost;
      o!.mortgaged = false;
      tx(e, p.id, 'bank', cost, 'reason.unmortgage');
      log(e, 'log.unmortgage', { p: p.id, s: action.space, amount: cost });
      return;
    }
    case 'borrow':
      doBorrow(e, p, action.amount);
      return;
    case 'repay': {
      assertCanSpend(e, p);
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount <= 0) fail('err.badAmount');
      if (amount > p.loan) fail('err.repayTooMuch');
      if (amount > p.cash) fail('err.insufficientFunds', { amount });
      p.cash -= amount;
      p.loan -= amount;
      tx(e, p.id, 'bank', amount, 'reason.repay');
      log(e, 'log.repay', { p: p.id, amount });
      return;
    }
    case 'settleDebt': {
      if (!hasPendingDebt(s, p.id)) fail('err.noDebt');
      if (!settleFirstDebt(e, p)) fail('err.insufficientFunds', { amount: s.debts.find((d) => d.debtorId === p.id)!.amount });
      return;
    }
    case 'declareBankruptcy': {
      const d = s.debts.find((x) => x.debtorId === p.id);
      if (!d) fail('err.noDebt');
      if (p.cash >= d!.amount) fail('err.canPay');
      goBankrupt(e, p, d!.creditor);
      return;
    }
    case 'leave': {
      const d = s.debts.find((x) => x.debtorId === p.id);
      p.forfeited = true;
      log(e, 'log.forfeit', { p: p.id });
      goBankrupt(e, p, d?.creditor ?? 'bank');
      return;
    }
    // ── social ──
    case 'tradeOffer': {
      const to = mustPlayer(e, action.toId);
      if (to.id === p.id || to.bankrupt) fail('err.badTrade');
      const give = normalizeSide(action.give);
      const get = normalizeSide(action.get);
      if (sideEmpty(give) && sideEmpty(get)) fail('err.emptyTrade');
      validateSide(e, p, give);
      validateSide(e, to, get);
      assertDebtorTradeOk(e, p, give, get);
      if (s.trades.filter((t) => t.fromId === p.id && t.status === 'pending').length >= RULES.maxPendingTradesPerPlayer) {
        fail('err.tooManyTrades');
      }
      if (action.counterOf) {
        const orig = s.trades.find((t) => t.id === action.counterOf);
        if (!orig || orig.status !== 'pending' || orig.toId !== p.id || orig.fromId !== to.id) fail('err.badTrade');
        orig!.status = 'rejected';
        e.ev.push({ type: 'trade', tradeId: orig!.id, status: 'rejected' });
      }
      const id = `t${s.seq + 1}-${Math.floor(e.ctx.rng() * 1e6).toString(36)}`;
      s.trades.push({
        id, fromId: p.id, toId: to.id, give, get, createdAt: e.ctx.now,
        expiresAt: e.ctx.now + s.config.tradeSeconds * 1000, status: 'pending', counterOf: action.counterOf,
      });
      if (s.trades.length > 60) s.trades = s.trades.filter((t) => t.status === 'pending' || s.trades.indexOf(t) >= s.trades.length - 40);
      log(e, 'log.tradeOffered', { p: p.id, p2: to.id });
      e.ev.push({ type: 'tradeOffer', toId: to.id, fromId: p.id });
      return;
    }
    case 'tradeRespond': {
      const t = s.trades.find((x) => x.id === action.tradeId);
      if (!t || t.toId !== p.id) fail('err.noTrade');
      if (t!.status !== 'pending') fail('err.tradeClosed');
      if (e.ctx.now >= t!.expiresAt) {
        t!.status = 'expired';
        fail('err.tradeExpired');
      }
      if (!action.accept) {
        t!.status = 'rejected';
        log(e, 'log.tradeRejected', { p: p.id, p2: t!.fromId });
        e.ev.push({ type: 'trade', tradeId: t!.id, status: 'rejected' });
        return;
      }
      const from = mustPlayer(e, t!.fromId);
      if (from.bankrupt) fail('err.tradeClosed');
      validateSide(e, from, t!.give);
      validateSide(e, p, t!.get);
      assertDebtorTradeOk(e, from, t!.give, t!.get);
      assertDebtorTradeOk(e, p, t!.get, t!.give);
      executeTrade(e, from, p, t!.give, t!.get);
      t!.status = 'accepted';
      log(e, 'log.tradeAccepted', { p: p.id, p2: from.id });
      e.ev.push({ type: 'trade', tradeId: t!.id, status: 'accepted' });
      // other offers may no longer be valid; they are re-validated on accept anyway.
      return;
    }
    case 'tradeCancel': {
      const t = s.trades.find((x) => x.id === action.tradeId);
      if (!t || t.fromId !== p.id) fail('err.noTrade');
      if (t!.status !== 'pending') fail('err.tradeClosed');
      t!.status = 'cancelled';
      e.ev.push({ type: 'trade', tradeId: t!.id, status: 'cancelled' });
      return;
    }
    case 'alliancePropose': {
      const to = mustPlayer(e, action.toId);
      if (to.id === p.id || to.bankrupt) fail('err.badAlliance');
      if (s.alliances.some((a) => (a.a === p.id && a.b === to.id) || (a.b === p.id && a.a === to.id))) fail('err.alreadyAllied');
      s.allianceProposals = s.allianceProposals.filter((a) => !(a.fromId === p.id && a.toId === to.id));
      s.allianceProposals.push({ fromId: p.id, toId: to.id, expiresAt: e.ctx.now + s.config.tradeSeconds * 1000 });
      log(e, 'log.allianceProposed', { p: p.id, p2: to.id });
      return;
    }
    case 'allianceRespond': {
      const prop = s.allianceProposals.find((a) => a.fromId === action.fromId && a.toId === p.id);
      if (!prop) fail('err.noProposal');
      s.allianceProposals = s.allianceProposals.filter((a) => a !== prop);
      if (action.accept) {
        s.alliances.push({ a: prop!.fromId, b: p.id, since: s.round, expiresRound: s.round + RULES.allianceRounds });
        log(e, 'log.allianceFormed', { p: prop!.fromId, p2: p.id });
      } else {
        log(e, 'log.allianceDeclined', { p: p.id, p2: prop!.fromId });
      }
      return;
    }
    case 'allianceBreak': {
      const a = s.alliances.find((x) => (x.a === p.id && x.b === action.withId) || (x.b === p.id && x.a === action.withId));
      if (!a) fail('err.notAllied');
      s.alliances = s.alliances.filter((x) => x !== a);
      log(e, 'log.allianceBroken', { p: p.id, p2: action.withId });
      return;
    }
    default:
      fail('err.badAction');
  }
}

/** Tester tools: only in tester rooms, only for the host. */
function testAction(e: E, p: Player, action: Action) {
  const { s } = e;
  if (!s.testMode) fail('err.testerOnly');
  if (p.id !== s.hostId) fail('err.hostOnly');
  const isInt = (n: unknown): n is number => Number.isInteger(n);
  switch (action.type) {
    case 'testDice': {
      const { d1, d2 } = action;
      if (!isInt(d1) || !isInt(d2) || d1 < 1 || d1 > 6 || d2 < 1 || d2 > 6) fail('err.badAmount');
      s.testDice = [...(s.testDice ?? []), [d1, d2]].slice(-10) as [number, number][];
      log(e, 'log.testDice', { p: p.id, d1, d2 });
      return;
    }
    case 'testMoveTo': {
      const cur = currentPlayer(s);
      if (!isInt(action.space) || action.space < 0 || action.space >= BOARD_SIZE) fail('err.badOption');
      if (s.phase !== 'preRoll') fail('err.wrongPhase', { phase: s.phase });
      if (cur.inJail) release(cur);
      // Acts as this turn's roll: walk forward to the space and resolve the landing.
      s.rolled = true;
      s.extraRoll = false;
      log(e, 'log.testMove', { p: cur.id, s: action.space });
      moveSteps(e, cur, (action.space - cur.position + BOARD_SIZE) % BOARD_SIZE || BOARD_SIZE);
      resolveLanding(e, cur);
      return;
    }
    case 'testStackCard': {
      const card = CARD_BY_ID[action.cardId];
      if (!card) fail('err.noCard');
      const deck = card!.deck;
      s.decks[deck] = [card!.id, ...s.decks[deck].filter((id) => id !== card!.id)];
      log(e, 'log.testStack', { p: p.id, card: card!.id });
      return;
    }
    case 'testCash': {
      if (!isInt(action.amount) || Math.abs(action.amount) > 1_000_000) fail('err.badAmount');
      p.cash = Math.max(0, p.cash + action.amount);
      log(e, 'log.testCash', { p: p.id, amount: action.amount });
      return;
    }
    default:
      fail('err.badAction');
  }
}

function normalizeSide(side: TradeSide | undefined): TradeSide {
  return {
    cash: Number(side?.cash ?? 0),
    properties: Array.isArray(side?.properties) ? side!.properties.map(Number) : [],
    jailCards: Number(side?.jailCards ?? 0),
  };
}

/** Called by the server every second: timers, expiry, disconnection policy. */
export function tick(s: GameState, ctx: Ctx): GameEvent[] {
  const e: E = { s, ctx, ev: [] };
  const now = ctx.now;
  const graceMs = s.config.reconnectGraceSeconds * 1000;

  // Host migration if the host stays away past the grace period.
  const host = getPlayer(s, s.hostId);
  if (host && !host.connected && host.disconnectedAt !== null && now - host.disconnectedAt > graceMs) {
    const next = humans(s).find((p) => p.connected && !p.bankrupt) ?? humans(s).find((p) => p.connected);
    if (next && next.id !== s.hostId) {
      s.hostId = next.id;
      log(e, 'log.hostChanged', { p: next.id });
    }
  }
  if (s.status !== 'playing') return e.ev;

  for (const t of s.trades) {
    if (t.status === 'pending' && now >= t.expiresAt) {
      t.status = 'expired';
      e.ev.push({ type: 'trade', tradeId: t.id, status: 'expired' });
    }
  }
  s.allianceProposals = s.allianceProposals.filter((a) => a.expiresAt > now);

  if (s.config.abandonSeconds > 0) {
    for (const p of s.players) {
      if (!p.bankrupt && !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > s.config.abandonSeconds * 1000) {
        p.forfeited = true;
        log(e, 'log.abandoned', { p: p.id });
        const d = s.debts.find((x) => x.debtorId === p.id);
        goBankrupt(e, p, d?.creditor ?? 'bank');
      }
    }
    normalize(e);
    if (s.status !== 'playing') return e.ev;
  }

  if (s.auction && now >= s.auction.endsAt) {
    endAuction(e);
  } else if (s.phase !== 'auction') {
    const cur = currentPlayer(s);
    const actor = s.phase === 'debt' && s.debts[0] ? mustPlayer(e, s.debts[0].debtorId) : cur;
    if (!actor.connected && actor.disconnectedAt !== null && now - actor.disconnectedAt > graceMs) {
      s.turnEndsAt = Math.min(s.turnEndsAt, Math.max(now, actor.disconnectedAt + graceMs) + RULES.autopilotTurnSeconds * 1000);
    }
    if (now >= s.turnEndsAt) {
      try {
        timeout(e, actor);
      } catch (err) {
        // Never let a failing auto-action wedge the room: retry shortly.
        if (!(err instanceof GameError)) throw err;
        s.turnEndsAt = now + 5000;
      }
    }
  }

  if (s.status === 'playing' && s.endsAt && now >= s.endsAt && (s.phase === 'preRoll' || s.phase === 'postRoll') && !s.auction && s.debts.length === 0) {
    finishTimed(e);
  }
  normalize(e);
  if (e.ev.length) s.updatedAt = now;
  return e.ev;
}

function timeout(e: E, actor: Player) {
  const { s } = e;
  log(e, 'log.timeout', { p: actor.id });
  switch (s.phase) {
    case 'preRoll':
      gameAction(e, actor, { type: actor.inJail ? 'jailRoll13' : 'roll' });
      return;
    case 'awaitBuy':
      gameAction(e, actor, { type: 'decline' });
      return;
    case 'cardChoice': {
      const card = s.pendingCard ? CARD_BY_ID[s.pendingCard.cardId] : null;
      const choice = card?.effects.find((x) => x.kind === 'choice') as Extract<CardEffect, { kind: 'choice' }> | undefined;
      if (choice) gameAction(e, actor, { type: 'cardChoice', option: choice.options.length - 1 });
      else finishResolution(e);
      return;
    }
    case 'quiz':
      if (s.quiz) finalizeQuiz(e);
      else setPhase(e, 'postRoll');
      return;
    case 'debt':
      autoLiquidate(e, actor);
      return;
    case 'postRoll':
      advanceTurn(e);
      return;
    default:
      return;
  }
}

/** Wealth ranking for display / timed games. */
export function standings(s: GameState) {
  return s.players.map((p) => wealthOf(s, p)).sort((a, b) => b.total - a.total);
}
