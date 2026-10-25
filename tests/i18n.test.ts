import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { en } from '../src/shared/i18n/en';
import { ru } from '../src/shared/i18n/ru';
import { BOARD } from '../src/shared/board';
import { translate } from '../src/shared/i18n';

const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('English and Russian have identical keys and placeholders', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(ph(ru[k]), k).toEqual(ph(en[k]));
  });

  it('every key used by the engine and server exists', () => {
    const src = ['engine.ts', 'rules.ts'].map((f) => readFileSync(`src/shared/${f}`, 'utf8')).join('\n')
      + readFileSync('src/server/app.ts', 'utf8');
    const used = new Set([...src.matchAll(/'((?:err|log|reason)\.[A-Za-z0-9]+)'/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(50);
    for (const k of used) expect(en, k).toHaveProperty([k]);
  });

  it('every board space has a name', () => {
    for (const s of BOARD) expect(en).toHaveProperty([`spaces.${s.key}`]);
  });

  it('formats numbers per locale', () => {
    expect(translate('en', 'act.buy', { amount: 12000 })).toBe('Buy for $12,000');
    expect(translate('ru', 'act.buy', { amount: 12000 }).replace(/\s/g, ' ')).toBe('Купить за $12 000');
  });
});
