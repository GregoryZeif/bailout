import { useMemo } from 'react';
import { BOARD } from '../shared/board';
import { CARD_BY_ID } from '../shared/cards';
import { INFLATION_BY_ID } from '../shared/inflation';
import { fill, formatNumber, translate } from '../shared/i18n';
import type { Lang, LogEntry } from '../shared/types';
import type { GameView } from '../shared/view';
import { useStore } from './store';

export function makeT(lang: Lang) {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const num = (n: number) => formatNumber(lang, n);
  const money = (n: number) => `$${formatNumber(lang, Math.round(n))}`;
  const spaceName = (i: number) => t(`spaces.${BOARD[i]?.key ?? 'start'}`);
  const cardText = (id: string, params: Record<string, string | number> = {}) => {
    const c = CARD_BY_ID[id];
    return c ? fill(lang, c.text[lang], params) : id;
  };
  const deckName = (id: string) => t(CARD_BY_ID[id]?.deck === 'community' ? 'card.community' : 'card.chance');
  const inflationText = (id: string, params: Record<string, string | number> = {}) => {
    const e = INFLATION_BY_ID[id];
    return e ? fill(lang, e.text[lang], params).replace(/\$\{\w+\}/g, '') : id;
  };

  /** Renders a language-neutral log entry for this viewer's language. */
  const logText = (entry: LogEntry, view: GameView | null) => {
    const name = (id: string | number) => view?.players.find((p) => p.id === id)?.name ?? String(id);
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(entry.params)) {
      if (k === 'p' || k === 'p2') params[k] = name(v);
      else if (k === 's') params[k] = spaceName(Number(v));
      else if (k === 'card') params[k] = deckName(String(v));
      else if (k === 'event') {
        const inf = view?.lastInflation;
        params[k] = inflationText(String(v), inf && inf.eventId === v ? inf.params : {});
      } else if (k === 'field') params[k] = t(`econ.${v}`);
      else params[k] = v;
    }
    if (entry.key === 'log.economy' && entry.params.field === 'loanRate') {
      return t('log.economyRate', { ...params, value: Math.round(Number(entry.params.value) * 1000) / 10 });
    }
    return t(entry.key, params);
  };
  return { t, num, money, spaceName, cardText, deckName, inflationText, logText, lang };
}

export type T = ReturnType<typeof makeT>;

export function useT(): T {
  const lang = useStore((s) => s.lang);
  return useMemo(() => makeT(lang), [lang]);
}
