/** Board integrity: property groups and names, nothing lost, duplicated or repriced. */
import { describe, expect, it } from 'vitest';
import { BOARD, GROUP_MEMBERS, isOwnable } from '../src/shared/board';
import { DICTS } from '../src/shared/i18n';
import type { ColorGroup } from '../src/shared/types';

const GROUPS: [ColorGroup, string, string[]][] = [
  ['brown', 'Slumlord Real Estate', ["Mom's Basement", 'Affordable Housing (Sold Out)']],
  ['lightblue', 'The Housing Crisis', ['Studio Apartment (No Kitchen)', 'The 30-Year Mortgage', "Your Landlord's Vacation Home"]],
  ['pink', 'Defense Contractors', ['Missile Solutions Inc.', 'Emergency Defense Systems', "The Lobbyist's Pentagon Dinner"]],
  ['orange', 'The Epstein Network', ['Little Saint James', 'The Lolita Express', 'The Unsealed Files']],
  ['red', 'Offshore Empire', ['Cayman Islands Holdings', 'Anonymous Shell Corporation', 'The Accountant Knows Nothing']],
  ['yellow', 'Tech Oligarchy', ['AI Landlord', 'Data Is the New Oil', 'Your Job Has Been Automated']],
  ['green', 'Political Influence', ['The Lobbying Office', 'Campaign Donations', 'The Revolving Door']],
  ['darkblue', 'The Untouchables', ['The Federal Reserve', 'Buy the Government']],
];

/** Prices by board position before the rename: names changed, the economy did not. */
const PRICES: Record<number, number> = {
  1: 2000, 3: 2200, 5: 5000, 6: 2600, 8: 2600, 9: 2800, 11: 3400, 12: 4500, 13: 3400, 14: 3800, 15: 5000,
  16: 4200, 18: 4200, 19: 4600, 21: 5400, 23: 5400, 24: 5800, 25: 5000, 26: 6600, 27: 6600, 28: 4500, 29: 7000,
  31: 8000, 32: 8000, 34: 8600, 35: 5000, 37: 10000, 39: 12000,
};

const en = (key: string) => DICTS.en[`spaces.${key}`];

describe('property groups', () => {
  it('each group holds exactly the listed properties, in board order', () => {
    for (const [group, name, props] of GROUPS) {
      expect(DICTS.en[`group.${group}`]).toBe(name);
      expect(GROUP_MEMBERS[group].map((i) => en(BOARD[i].key))).toEqual(props);
    }
  });

  it('no property was removed, duplicated or repriced', () => {
    expect(BOARD).toHaveLength(40);
    expect(BOARD.map((d) => d.index)).toEqual([...Array(40).keys()]);
    const owned = BOARD.filter(isOwnable);
    expect(owned).toHaveLength(28);
    expect(Object.fromEntries(owned.map((d) => [d.index, d.price]))).toEqual(PRICES);
    const props = BOARD.filter((d) => d.kind === 'property');
    expect(props).toHaveLength(22);
    expect(new Set(props.map((d) => d.key)).size).toBe(22);
    expect(new Set(props.map((d) => en(d.key))).size).toBe(22);
    expect(props.map((d) => en(d.key)).sort()).toEqual(GROUPS.flatMap(([, , p]) => p).sort());
  });

  it('every space and group has a name in every language', () => {
    for (const lang of ['en', 'ru'] as const) {
      for (const d of BOARD) expect(DICTS[lang][`spaces.${d.key}`], `${lang} ${d.key}`).toBeTruthy();
      for (const [g] of GROUPS) expect(DICTS[lang][`group.${g}`], `${lang} group.${g}`).toBeTruthy();
    }
  });

  it('the defense-contractor exemption sits on defense spaces', () => {
    expect(BOARD.filter((d) => d.defense).map((d) => en(d.key))).toEqual(['Missile Solutions Inc.', 'Drone Delivery Co.']);
  });
});
