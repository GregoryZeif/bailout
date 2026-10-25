import type { Lang } from '../types.js';
import { en } from './en.js';
import { ru } from './ru.js';

export const DICTS: Record<Lang, Record<string, string>> = { en, ru };
export const LANGS: Lang[] = ['en', 'ru'];

export function formatNumber(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 }).format(n);
}

/** Translate a key, filling {placeholders}. Numbers are locale-formatted. */
export function translate(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const tpl = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  return fill(lang, tpl, params);
}

export function fill(lang: Lang, tpl: string, params: Record<string, string | number> = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    if (v === undefined) return m;
    return typeof v === 'number' ? formatNumber(lang, v) : v;
  });
}
