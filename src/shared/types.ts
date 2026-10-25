// Core domain types shared by server, client and tests.

export type Lang = 'en' | 'ru';
export type PlayerId = string;
export type Creditor = PlayerId | 'bank';

export type ColorGroup =
  | 'brown' | 'lightblue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'darkblue';

export type SpaceKind =
  | 'start' | 'property' | 'infra' | 'utility' | 'chance' | 'community'
  | 'propertyTax' | 'emergencyTax' | 'jail' | 'bailout' | 'goToJail';

export interface SpaceDef {
  index: number;
  kind: SpaceKind;
  /** i18n key suffix: spaces.<key> */
  key: string;
  price?: number;
  group?: ColorGroup;
  /** Marked as defense contractor (exempt from military levies). */
  defense?: boolean;
}

export type TokenId = 'avocado' | 'cart' | 'briefcase' | 'piggy' | 'drone' | 'coffee';

export interface Player {
  id: PlayerId;
  name: string;
  token: TokenId;
  color: string;
  cash: number;
  loan: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  bankruptRound?: number;
  ready: boolean;
  connected: boolean;
  /** Epoch ms when the player disconnected, null when connected. */
  disconnectedAt: number | null;
  /** Players who left voluntarily or were abandoned. */
  forfeited: boolean;
  /** Set to true once the player has taken the quiz this jail turn. */
  quizTakenThisTurn: boolean;
  /** Computer-controlled player, driven by the server. */
  bot?: boolean;
}

export interface OwnedProperty {
  ownerId: PlayerId;
  /** 0–4 Luxury Renovations, 5 = Billionaire Compound. */
  upgrades: number;
  mortgaged: boolean;
}

export interface Economy {
  /** Multiplies all rent. */
  rentMult: number;
  /** Multiplies taxes, fees and card payments to the bank. */
  costMult: number;
  /** Multiplies purchase prices of unowned property. */
  priceMult: number;
  /** Loan interest charged per own turn (fraction). */
  loanRate: number;
  /** Money collected by landing on Government Bailout. */
  bailoutPot: number;
}

export interface GameConfig {
  /** 0 = no time limit (last solvent player wins). */
  timeLimitMinutes: number;
  turnSeconds: number;
  auctionSeconds: number;
  tradeSeconds: number;
  /** Probability of an inflation event at start of each round (after grace period). */
  inflationChance: number;
  /** Seconds a disconnected player keeps full turn time before autopilot. */
  reconnectGraceSeconds: number;
  /** Seconds after which a disconnected player forfeits (0 = never). */
  abandonSeconds: number;
  startingCash: number;
  salary: number;
  maxPlayers: number;
}

export type TurnPhase =
  | 'preRoll'      // may manage, negotiate, then roll (or jail options)
  | 'awaitBuy'     // landed on unowned property
  | 'auction'      // auction in progress
  | 'cardChoice'   // a card requires a decision
  | 'quiz'         // citizenship test in progress
  | 'debt'         // somebody owes money they don't have in cash
  | 'postRoll';    // may manage, then end turn

export interface Debt {
  debtorId: PlayerId;
  creditor: Creditor;
  amount: number;
  reasonKey: string;
  /** Bank payments that feed the bailout pot. */
  toPot?: boolean;
}

export interface AuctionState {
  space: number;
  highBid: number;
  highBidderId: PlayerId | null;
  passed: PlayerId[];
  endsAt: number;
  /** Where to go after the auction: 'finish' completes the landing resolution. */
  returnPhase: TurnPhase | 'finish';
}

export interface PendingCard {
  cardId: string;
  playerId: PlayerId;
}

export interface QuizState {
  playerId: PlayerId;
  questionIds: string[];
  answers: (number | null)[];
}

export interface TradeSide {
  cash: number;
  properties: number[];
  jailCards: number;
}

export interface TradeOffer {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
  give: TradeSide; // what fromId gives
  get: TradeSide;  // what fromId receives
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled' | 'invalid';
  counterOf?: string;
}

export interface Alliance {
  a: PlayerId;
  b: PlayerId;
  since: number; // round number
  expiresRound: number;
}
export interface AllianceProposal { fromId: PlayerId; toId: PlayerId; expiresAt: number }

export interface LogEntry {
  seq: number;
  at: number;
  key: string;
  params: Record<string, string | number>;
}

export interface Transaction {
  seq: number;
  at: number;
  round: number;
  from: Creditor;
  to: Creditor | 'pot';
  amount: number;
  reasonKey: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  playerId: PlayerId;
  text: string;
}

export interface WealthBreakdown {
  playerId: PlayerId;
  cash: number;
  propertyValue: number;
  upgradeValue: number;
  mortgageDebt: number;
  loan: number;
  total: number;
}

export interface GameState {
  id: string;
  code: string;
  hostId: PlayerId;
  status: 'lobby' | 'playing' | 'finished';
  config: GameConfig;
  players: Player[];
  /** Index into players of the active player. */
  current: number;
  round: number;
  phase: TurnPhase;
  /** True once the active player rolled during this (sub)turn. */
  rolled: boolean;
  doublesCount: number;
  /** True when the last roll was doubles and another roll is owed. */
  extraRoll: boolean;
  lastDice: [number, number] | null;
  turnEndsAt: number;
  properties: Record<number, OwnedProperty>;
  decks: { chance: string[]; community: string[] };
  economy: Economy;
  /** Queue of debts to settle, first one is active. */
  debts: Debt[];
  /** Phase to resume once all debts are settled. */
  resumePhase: TurnPhase | null;
  /** Result of the most recent citizenship test, for display. */
  lastQuiz: { playerId: PlayerId; questionIds: string[]; answers: (number | null)[]; correct: boolean[]; passed: boolean; seq: number } | null;
  /** Most recent inflation event, for display. */
  lastInflation: { eventId: string; round: number; params: Record<string, number | string>; seq: number } | null;
  auction: AuctionState | null;
  /** Properties waiting to be auctioned (returned to bank). */
  auctionQueue: number[];
  pendingCard: PendingCard | null;
  /** Last drawn card shown to everyone. */
  lastCard: { cardId: string; playerId: PlayerId; seq: number; params: Record<string, number | string> } | null;
  quiz: QuizState | null;
  trades: TradeOffer[];
  alliances: Alliance[];
  allianceProposals: AllianceProposal[];
  log: LogEntry[];
  transactions: Transaction[];
  chat: ChatMessage[];
  seq: number;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  winnerId: PlayerId | null;
  finalWealth: WealthBreakdown[] | null;
  /** Recently processed client action ids (dedup). */
  processed: string[];
  createdAt: number;
  updatedAt: number;
}

/** Transient events emitted by an action, for animation and sound. */
export type GameEvent =
  | { type: 'dice'; playerId: PlayerId; dice: [number, number] }
  | { type: 'move'; playerId: PlayerId; from: number; to: number; direct: boolean }
  | { type: 'buy'; playerId: PlayerId; space: number }
  | { type: 'rent'; from: PlayerId; to: PlayerId; amount: number }
  | { type: 'pay'; playerId: PlayerId; amount: number }
  | { type: 'collect'; playerId: PlayerId; amount: number }
  | { type: 'card'; playerId: PlayerId; cardId: string }
  | { type: 'inflation'; eventId: string }
  | { type: 'jail'; playerId: PlayerId }
  | { type: 'bankrupt'; playerId: PlayerId }
  | { type: 'trade'; tradeId: string; status: TradeOffer['status'] }
  | { type: 'tradeOffer'; toId: PlayerId; fromId: PlayerId }
  | { type: 'auction'; space: number }
  | { type: 'win'; playerId: PlayerId | null }
  | { type: 'chat'; playerId: PlayerId };

export type Action =
  // lobby
  | { type: 'setReady'; ready: boolean }
  | { type: 'setToken'; token: TokenId }
  | { type: 'configure'; config: Partial<GameConfig> }
  | { type: 'start' }
  | { type: 'addBot' }
  | { type: 'removeBot'; playerId: PlayerId }
  // turn
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'endTurn' }
  | { type: 'bid'; amount: number }
  | { type: 'passAuction' }
  | { type: 'cardChoice'; option: number }
  // jail
  | { type: 'jailPay' }
  | { type: 'jailCard' }
  | { type: 'jailRoll13' }
  | { type: 'quizStart' }
  | { type: 'quizAnswer'; index: number; answer: number }
  // assets
  | { type: 'upgrade'; space: number }
  | { type: 'sellUpgrade'; space: number }
  | { type: 'mortgage'; space: number }
  | { type: 'unmortgage'; space: number }
  | { type: 'borrow'; amount: number }
  | { type: 'repay'; amount: number }
  | { type: 'settleDebt' }
  | { type: 'declareBankruptcy' }
  // social
  | { type: 'tradeOffer'; toId: PlayerId; give: TradeSide; get: TradeSide; counterOf?: string }
  | { type: 'tradeRespond'; tradeId: string; accept: boolean }
  | { type: 'tradeCancel'; tradeId: string }
  | { type: 'alliancePropose'; toId: PlayerId }
  | { type: 'allianceRespond'; fromId: PlayerId; accept: boolean }
  | { type: 'allianceBreak'; withId: PlayerId }
  | { type: 'chat'; text: string }
  | { type: 'leave' };

export class GameError extends Error {
  constructor(public code: string, public params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'GameError';
  }
}
