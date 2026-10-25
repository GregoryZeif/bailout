/** Pure rule calculations, shared by the engine and the client for display. */
import { BOARD, GROUP_MEMBERS, RULES, isOwnable } from './board.js';
import type { GameState, Player, PlayerId, WealthBreakdown } from './types.js';

export const round10 = (x: number) => Math.max(0, Math.round(x / 10) * 10);

export function activePlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.bankrupt);
}

export function getPlayer(s: GameState, id: PlayerId): Player | undefined {
  return s.players.find((p) => p.id === id);
}

export function ownedBy(s: GameState, playerId: PlayerId): number[] {
  return Object.entries(s.properties)
    .filter(([, o]) => o.ownerId === playerId)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}

/** Scales a bank-bound cost by inflation. */
export function scaled(s: GameState, amount: number): number {
  return round10(amount * s.economy.costMult);
}

export function currentPrice(s: GameState, space: number): number {
  return round10((BOARD[space].price ?? 0) * s.economy.priceMult);
}

export function luxuryTax(s: GameState, space: number): number {
  const base = BOARD[space].price ?? 0;
  return base >= RULES.luxuryThreshold ? round10(currentPrice(s, space) * RULES.luxuryTaxPct) : 0;
}

export function ownsGroup(s: GameState, space: number, ownerId: PlayerId): boolean {
  const g = BOARD[space].group;
  if (!g) return false;
  return GROUP_MEMBERS[g].every((i) => s.properties[i]?.ownerId === ownerId);
}

export function baseRent(space: number): number {
  return round10((BOARD[space].price ?? 0) * RULES.baseRentPct);
}

export function allied(s: GameState, a: PlayerId, b: PlayerId): boolean {
  return s.alliances.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

/** Rent owed by payer for landing on space (0 if unowned / own / mortgaged). */
export function rentFor(s: GameState, space: number, diceSum: number, payerId?: PlayerId, mult = 1): number {
  const o = s.properties[space];
  if (!o || o.mortgaged || o.ownerId === payerId) return 0;
  const def = BOARD[space];
  let rent = 0;
  if (def.kind === 'property') {
    const b = baseRent(space);
    if (o.upgrades > 0) rent = b * RULES.upgradeRentMult[o.upgrades];
    else rent = ownsGroup(s, space, o.ownerId) ? b * RULES.groupBonusMult : b;
  } else if (def.kind === 'infra') {
    const n = BOARD.filter((d) => d.kind === 'infra' && s.properties[d.index]?.ownerId === o.ownerId).length;
    rent = RULES.infraRent[n];
  } else if (def.kind === 'utility') {
    const n = BOARD.filter((d) => d.kind === 'utility' && s.properties[d.index]?.ownerId === o.ownerId).length;
    rent = diceSum * RULES.utilityDiceMult[n];
  }
  rent = rent * s.economy.rentMult * mult;
  if (payerId && allied(s, payerId, o.ownerId)) rent *= 1 - RULES.allianceRentDiscount;
  return round10(rent);
}

export function upgradeCost(s: GameState, space: number): number {
  return round10((BOARD[space].price ?? 0) * RULES.upgradeCostPct * s.economy.costMult);
}
export function upgradeRefund(space: number): number {
  return round10((BOARD[space].price ?? 0) * RULES.upgradeCostPct * RULES.upgradeSellRefundPct);
}
export function mortgageValue(space: number): number {
  return round10((BOARD[space].price ?? 0) * RULES.mortgagePct);
}
export function unmortgageCost(space: number): number {
  return round10((BOARD[space].price ?? 0) * RULES.unmortgagePct);
}

export function creditLimit(s: GameState, playerId: PlayerId): number {
  const collateral = ownedBy(s, playerId)
    .filter((i) => !s.properties[i].mortgaged)
    .reduce((sum, i) => sum + (BOARD[i].price ?? 0), 0);
  return Math.floor((RULES.creditBase + collateral * RULES.creditPropertyPct) / RULES.loanStep) * RULES.loanStep;
}

export function availableCredit(s: GameState, p: Player): number {
  return Math.max(0, creditLimit(s, p.id) - p.loan);
}

export function loanInterest(s: GameState, p: Player): number {
  if (p.loan <= 0) return 0;
  return Math.max(10, round10(p.loan * s.economy.loanRate));
}

export function propertyTax(s: GameState, playerId: PlayerId): { base: number; perProperty: number; perUpgrade: number; total: number } {
  const owned = ownedBy(s, playerId);
  const ups = owned.reduce((n, i) => n + s.properties[i].upgrades, 0);
  const base = scaled(s, RULES.propertyTaxBase);
  const perProperty = scaled(s, RULES.propertyTaxPerProperty) * owned.length;
  const perUpgrade = scaled(s, RULES.propertyTaxPerUpgrade) * ups;
  return { base, perProperty, perUpgrade, total: base + perProperty + perUpgrade };
}

export function hasPendingDebt(s: GameState, playerId: PlayerId): boolean {
  return s.debts.some((d) => d.debtorId === playerId);
}

/** Returns an error code, or null when the upgrade is allowed (ignoring turn/cash). */
export function upgradeBlocker(s: GameState, playerId: PlayerId, space: number): string | null {
  const def = BOARD[space];
  const o = s.properties[space];
  if (!def || def.kind !== 'property' || !def.group) return 'err.notUpgradable';
  if (!o || o.ownerId !== playerId) return 'err.notOwner';
  if (!ownsGroup(s, space, playerId)) return 'err.needGroup';
  const members = GROUP_MEMBERS[def.group];
  if (members.some((i) => s.properties[i].mortgaged)) return 'err.groupMortgaged';
  if (o.upgrades >= 5) return 'err.maxUpgrades';
  const min = Math.min(...members.map((i) => s.properties[i].upgrades));
  if (o.upgrades > min) return 'err.buildEvenly';
  return null;
}

export function sellUpgradeBlocker(s: GameState, playerId: PlayerId, space: number): string | null {
  const def = BOARD[space];
  const o = s.properties[space];
  if (!o || o.ownerId !== playerId) return 'err.notOwner';
  if (o.upgrades <= 0 || !def.group) return 'err.noUpgrades';
  const max = Math.max(...GROUP_MEMBERS[def.group].map((i) => s.properties[i]?.upgrades ?? 0));
  if (o.upgrades < max) return 'err.sellEvenly';
  return null;
}

export function groupHasUpgrades(s: GameState, space: number): boolean {
  const g = BOARD[space].group;
  if (!g) return false;
  return GROUP_MEMBERS[g].some((i) => (s.properties[i]?.upgrades ?? 0) > 0);
}

export function mortgageBlocker(s: GameState, playerId: PlayerId, space: number): string | null {
  const o = s.properties[space];
  if (!o || o.ownerId !== playerId) return 'err.notOwner';
  if (o.mortgaged) return 'err.alreadyMortgaged';
  if (groupHasUpgrades(s, space)) return 'err.sellUpgradesFirst';
  return null;
}

export function wealthOf(s: GameState, p: Player): WealthBreakdown {
  const owned = ownedBy(s, p.id);
  const propertyValue = owned.reduce((n, i) => n + (BOARD[i].price ?? 0), 0);
  const upgradeValue = owned.reduce(
    (n, i) => n + s.properties[i].upgrades * round10((BOARD[i].price ?? 0) * RULES.upgradeCostPct), 0);
  const mortgageDebt = owned.filter((i) => s.properties[i].mortgaged).reduce((n, i) => n + mortgageValue(i), 0);
  const total = p.cash + propertyValue + upgradeValue - mortgageDebt - p.loan;
  return { playerId: p.id, cash: p.cash, propertyValue, upgradeValue, mortgageDebt, loan: p.loan, total };
}

export function ownableSpaces(): number[] {
  return BOARD.filter(isOwnable).map((d) => d.index);
}

/** Owns a defense-contractor space (exempt from military levies). */
export function ownsDefense(s: GameState, playerId: PlayerId): boolean {
  return BOARD.some((d) => d.defense && s.properties[d.index]?.ownerId === playerId);
}
