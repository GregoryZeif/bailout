/** Round-start inflation events. Text lives here so adding one is a single edit. */
import type { CardEffect } from './cards.js';
import type { Lang } from './types.js';

export interface InflationEvent {
  id: string;
  weight: number;
  effects: CardEffect[];
  text: Record<Lang, string>;
}

export const INFLATION_EVENTS: InflationEvent[] = [
  {
    id: 'inf_rent25', weight: 3,
    effects: [{ kind: 'economy', field: 'rentMult', factor: 1.25 }],
    text: { en: 'Rent increases by 25%. Everywhere. Forever.', ru: 'Аренда выросла на 25%. Везде. Навсегда.' },
  },
  {
    id: 'inf_groceries', weight: 3,
    effects: [{ kind: 'allPay', amount: 300 }],
    text: { en: 'Groceries now cost ${amount}. Every player pays for one bag.', ru: 'Продукты теперь стоят ${amount}. Каждый игрок платит за один пакет.' },
  },
  {
    id: 'inf_rates_double', weight: 2,
    effects: [{ kind: 'economy', field: 'loanRate', factor: 2 }],
    text: { en: 'Interest rates double. Your loan is thrilled.', ru: 'Процентные ставки удвоились. Ваш кредит в восторге.' },
  },
  {
    id: 'inf_salary_zero', weight: 3,
    effects: [{ kind: 'economy', field: 'costMult', factor: 1.1 }],
    text: { en: 'Taxes and fees rise 10%. Your salary is adjusted for inflation by exactly 0%.', ru: 'Налоги и сборы выросли на 10%. Ваша зарплата проиндексирована ровно на 0%.' },
  },
  {
    id: 'inf_everything_fine', weight: 2,
    effects: [{ kind: 'economy', field: 'priceMult', factor: 1.1 }, { kind: 'economy', field: 'rentMult', factor: 1.05 }],
    text: { en: 'The central bank announces that everything is fine. Prices +10%, rent +5%.', ru: 'Центробанк объявляет, что всё в порядке. Цены +10%, аренда +5%.' },
  },
];

export const INFLATION_BY_ID: Record<string, InflationEvent> = Object.fromEntries(INFLATION_EVENTS.map((e) => [e.id, e]));
