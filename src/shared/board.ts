import type { ColorGroup, GameConfig, SpaceDef, TokenId } from './types.js';

/** 40-space board. Names live in i18n under spaces.<key>. */
export const BOARD: SpaceDef[] = [
  { index: 0, kind: 'start', key: 'start' },
  { index: 1, kind: 'property', key: 'starterHome', price: 2000, group: 'brown' },
  { index: 2, kind: 'community', key: 'community' },
  { index: 3, kind: 'property', key: 'basementStudio', price: 2200, group: 'brown' },
  { index: 4, kind: 'propertyTax', key: 'propertyTax' },
  { index: 5, kind: 'infra', key: 'tollRoad', price: 5000 },
  { index: 6, kind: 'property', key: 'affordableHousing', price: 2600, group: 'lightblue' },
  { index: 7, kind: 'chance', key: 'chance' },
  { index: 8, kind: 'property', key: 'lastAffordable', price: 2600, group: 'lightblue' },
  { index: 9, kind: 'property', key: 'coLiving', price: 2800, group: 'lightblue' },
  { index: 10, kind: 'jail', key: 'jail' },
  { index: 11, kind: 'property', key: 'gigLofts', price: 3400, group: 'pink' },
  { index: 12, kind: 'utility', key: 'waterSupply', price: 4500 },
  { index: 13, kind: 'property', key: 'influencerVilla', price: 3400, group: 'pink' },
  { index: 14, kind: 'property', key: 'crypto', price: 3800, group: 'pink' },
  { index: 15, kind: 'infra', key: 'privateRail', price: 5000 },
  { index: 16, kind: 'property', key: 'aiLandlord', price: 4200, group: 'orange' },
  { index: 17, kind: 'community', key: 'community' },
  { index: 18, kind: 'property', key: 'smartFridge', price: 4200, group: 'orange' },
  { index: 19, kind: 'property', key: 'surgePricing', price: 4600, group: 'orange' },
  { index: 20, kind: 'bailout', key: 'bailout' },
  { index: 21, kind: 'property', key: 'siliconRent', price: 5400, group: 'red' },
  { index: 22, kind: 'chance', key: 'chance' },
  { index: 23, kind: 'property', key: 'ventureGarage', price: 5400, group: 'red' },
  { index: 24, kind: 'property', key: 'unicornCampus', price: 5800, group: 'red' },
  { index: 25, kind: 'infra', key: 'droneLogistics', price: 5000, defense: true },
  { index: 26, kind: 'property', key: 'healthcareIsland', price: 6600, group: 'yellow' },
  { index: 27, kind: 'property', key: 'pharmaTower', price: 6600, group: 'yellow' },
  { index: 28, kind: 'utility', key: 'aiElectric', price: 4500 },
  { index: 29, kind: 'property', key: 'insuranceMaze', price: 7000, group: 'yellow' },
  { index: 30, kind: 'goToJail', key: 'goToJail' },
  { index: 31, kind: 'property', key: 'lobbyistRow', price: 8000, group: 'green' },
  { index: 32, kind: 'property', key: 'superPac', price: 8000, group: 'green' },
  { index: 33, kind: 'community', key: 'community' },
  { index: 34, kind: 'property', key: 'contractorHq', price: 8600, group: 'green', defense: true },
  { index: 35, kind: 'infra', key: 'satelliteNet', price: 5000 },
  { index: 36, kind: 'chance', key: 'chance' },
  { index: 37, kind: 'property', key: 'taxHaven', price: 10000, group: 'darkblue' },
  { index: 38, kind: 'emergencyTax', key: 'emergencyTax' },
  { index: 39, kind: 'property', key: 'orbitalPenthouse', price: 12000, group: 'darkblue' },
];

export const JAIL_INDEX = 10;
export const BAILOUT_INDEX = 20;
export const GO_TO_JAIL_INDEX = 30;
export const BOARD_SIZE = BOARD.length;

export const GROUP_COLORS: Record<ColorGroup, string> = {
  brown: '#8a5a3b',
  lightblue: '#7fb6d6',
  pink: '#c86b98',
  orange: '#d9853b',
  red: '#c0392b',
  yellow: '#d8b13a',
  green: '#4f8a5b',
  darkblue: '#24427a',
};

export const GROUP_MEMBERS: Record<ColorGroup, number[]> = BOARD.reduce((acc, s) => {
  if (s.group) (acc[s.group] ||= []).push(s.index);
  return acc;
}, {} as Record<ColorGroup, number[]>);

export const TOKENS: TokenId[] = ['avocado', 'cart', 'briefcase', 'piggy', 'drone', 'coffee'];
export const PLAYER_COLORS = ['#e0533d', '#3d8be0', '#e0b43d', '#5cb85c', '#a45ce0', '#e07a3d'];

/** Tunable economy rules. Everything numeric lives here. */
export const RULES = {
  studentLoanPayment: 200,
  baseRentPct: 0.1,
  /** Rent multiplier by upgrade level 0..5 (5 = Billionaire Compound). */
  upgradeRentMult: [1, 3, 7, 12, 17, 24],
  groupBonusMult: 2,
  upgradeCostPct: 0.5,
  upgradeSellRefundPct: 0.5,
  mortgagePct: 0.5,
  unmortgagePct: 0.55,
  infraRent: [0, 500, 1000, 2000, 4000],
  utilityDiceMult: [0, 100, 250],
  luxuryThreshold: 8000,
  luxuryTaxPct: 0.1,
  propertyTaxBase: 150,
  propertyTaxPerProperty: 100,
  propertyTaxPerUpgrade: 50,
  emergencyTax: 500,
  potShareOfBankPayments: 0.5,
  jailFee: 1000,
  jailMaxTurns: 3,
  quizFailFee: 100,
  quizQuestions: 3,
  loanBaseRate: 0.05,
  loanStep: 100,
  creditBase: 2000,
  creditPropertyPct: 0.5,
  auctionMinIncrement: 100,
  inflationGraceRounds: 2,
  maxRentMult: 2.5,
  maxCostMult: 2.5,
  maxPriceMult: 2,
  maxLoanRate: 0.2,
  maxPendingTradesPerPlayer: 3,
  allianceRounds: 3,
  allianceRentDiscount: 0.2,
  chatMaxLength: 300,
  logLimit: 300,
  chatLimit: 200,
  transactionLimit: 300,
  processedLimit: 300,
  autopilotTurnSeconds: 8,
  debtSeconds: 60,
  quizSeconds: 60,
};

export const DEFAULT_CONFIG: GameConfig = {
  // Safety net so sessions stay within ~45 minutes; host can set 0 for last-solvent-only.
  timeLimitMinutes: 45,
  turnSeconds: 90,
  auctionSeconds: 15,
  tradeSeconds: 60,
  inflationChance: 0.35,
  reconnectGraceSeconds: 60,
  abandonSeconds: 600,
  startingCash: 1500,
  salary: 2000,
  maxPlayers: 6,
};

/** Validation bounds for host-configurable settings. */
export const CONFIG_BOUNDS: Record<keyof GameConfig, [number, number]> = {
  timeLimitMinutes: [0, 120],
  turnSeconds: [20, 300],
  auctionSeconds: [8, 60],
  tradeSeconds: [20, 300],
  inflationChance: [0, 1],
  reconnectGraceSeconds: [10, 600],
  abandonSeconds: [0, 3600],
  startingCash: [500, 10000],
  salary: [0, 10000],
  maxPlayers: [2, 6],
};

export function isOwnable(s: SpaceDef): boolean {
  return s.kind === 'property' || s.kind === 'infra' || s.kind === 'utility';
}
