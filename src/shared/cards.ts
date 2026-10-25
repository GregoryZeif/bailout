/**
 * Centralized event-card data. To add a card: append an entry with a unique id,
 * a deck, a category, effects (see CardEffect) and text in every language.
 * Placeholders like {amount} are filled from the effect values at draw time
 * (`p` names the placeholder, default "amount"), so text always matches the
 * amount actually charged. tests/cards.test.ts applies every card.
 */
import type { Lang } from './types.js';

export type Deck = 'chance' | 'community';
export type CardCategory = 'economic' | 'political' | 'luck' | 'bureaucracy' | 'corporate' | 'social';

export type EconomyField = 'rentMult' | 'costMult' | 'priceMult' | 'loanRate';

export type CardEffect =
  /** Pay the bank (scaled by inflation costMult). */
  | { kind: 'pay'; amount: number; p?: string }
  /** Receive from the bank (never inflation-adjusted, by design). */
  | { kind: 'collect'; amount: number; p?: string }
  | { kind: 'payEach'; amount: number; p?: string }
  | { kind: 'collectEach'; amount: number; p?: string }
  /** Every active player pays the bank; optionally exempts defense-contractor owners. */
  | { kind: 'allPay'; amount: number; exemptDefense?: boolean; p?: string }
  | { kind: 'moveTo'; space: number }
  | { kind: 'moveBy'; steps: number; p?: string }
  | { kind: 'nearest'; target: 'infra' | 'utility'; rentMult?: number }
  | { kind: 'goToJail' }
  | { kind: 'jailCard' }
  /** Pay per owned property and per upgrade (scaled). Total goes to {amount}. */
  | { kind: 'perAsset'; perProperty: number; perUpgrade: number }
  /** Pay a percentage of current cash. */
  | { kind: 'percentCash'; pct: number }
  /** Multiply a global economy value (capped). */
  | { kind: 'economy'; field: EconomyField; factor: number; p?: string }
  /** From the richest (by cash) to the poorest active player, or the reverse. */
  | { kind: 'transfer'; from: 'richest' | 'poorest'; amount: number; p?: string }
  /** Collect a percentage of the bailout pot. */
  | { kind: 'potShare'; pct: number }
  | { kind: 'forgiveLoan'; amount: number; p?: string }
  /** Adds to the loan balance without cash. */
  | { kind: 'addLoan'; amount: number; p?: string }
  /** Receive a random unowned property (or fallback cash) — combine with pay for taxes. */
  | { kind: 'inherit'; fallbackCash: number }
  | { kind: 'choice'; options: { label: Record<Lang, string>; effects: CardEffect[] }[] };

export interface CardDef {
  id: string;
  deck: Deck;
  category: CardCategory;
  effects: CardEffect[];
  text: Record<Lang, string>;
}

export const CARDS: CardDef[] = [
  // ───────────── BREAKING NEWS (chance) ─────────────
  // Political satire
  {
    id: 'pol_security_package', deck: 'chance', category: 'political',
    effects: [{ kind: 'pay', amount: 2000 }],
    text: {
      en: 'Big Yahu announces another historic security package. Pay ${amount} in administrative and defense-related expenses.',
      ru: 'Биг Яху объявляет очередной исторический пакет безопасности. Заплатите ${amount} административных и оборонных расходов.',
    },
  },
  {
    id: 'pol_military_levy', deck: 'chance', category: 'political',
    effects: [{ kind: 'allPay', amount: 200, exemptDefense: true }],
    text: {
      en: 'A new international aid package is announced. All players pay a ${amount} emergency levy — except owners of a defense contractor.',
      ru: 'Объявлен новый международный пакет помощи. Все игроки платят экстренный сбор ${amount} — кроме владельцев оборонного подрядчика.',
    },
  },
  {
    id: 'pol_ribbon', deck: 'chance', category: 'political',
    effects: [{ kind: 'pay', amount: 150 }],
    text: {
      en: 'A minister cuts a ribbon at your local pothole. Pay ${amount} for the ceremony.',
      ru: 'Министр торжественно перерезает ленточку у вашей ямы на дороге. Заплатите ${amount} за церемонию.',
    },
  },
  {
    id: 'pol_election_promise', deck: 'chance', category: 'political',
    effects: [{ kind: 'economy', field: 'rentMult', factor: 1.1 }],
    text: {
      en: 'Election season! A candidate promises to cut your rent. All rent rises 10% instead.',
      ru: 'Выборы! Кандидат обещает снизить аренду. Вместо этого вся аренда растёт на 10%.',
    },
  },
  {
    id: 'pol_campaign_donation', deck: 'chance', category: 'political',
    effects: [{ kind: 'pay', amount: 300 }, { kind: 'jailCard' }],
    text: {
      en: 'You donate to both parties "just in case". Pay ${amount} and receive a Get Out of Court card.',
      ru: 'Вы жертвуете обеим партиям «на всякий случай». Заплатите ${amount} и получите карту «Выйти из суда».',
    },
  },
  {
    id: 'pol_lobby_refund', deck: 'chance', category: 'political',
    effects: [{ kind: 'collect', amount: 800 }],
    text: {
      en: 'Your lobbyist secures a tax rebate written specifically for people exactly like you. Collect ${amount}.',
      ru: 'Ваш лоббист добился налогового вычета, написанного ровно под таких, как вы. Получите ${amount}.',
    },
  },
  {
    id: 'pol_coalition', deck: 'chance', category: 'political',
    effects: [{ kind: 'allPay', amount: 150 }],
    text: {
      en: 'Coalition crisis! Every player pays ${amount} to keep the government standing for another week.',
      ru: 'Коалиционный кризис! Каждый игрок платит ${amount}, чтобы правительство продержалось ещё неделю.',
    },
  },
  {
    id: 'pol_summit', deck: 'chance', category: 'political',
    effects: [{ kind: 'moveTo', space: 26 }],
    text: {
      en: 'Emergency summit at a luxury resort, catered by robots. Advance to AI Landlord.',
      ru: 'Экстренный саммит на роскошном курорте с роботами-официантами. Перейдите на «ИИ-арендодателя».',
    },
  },
  {
    id: 'pol_investigation', deck: 'chance', category: 'political',
    effects: [{ kind: 'goToJail' }],
    text: {
      en: 'You are named in an investigation that will take 11 years. Go directly to Immigration Court.',
      ru: 'Вас упомянули в расследовании, которое продлится 11 лет. Отправляйтесь прямо в Миграционный суд.',
    },
  },
  {
    id: 'pol_bailout_error', deck: 'chance', category: 'political',
    effects: [{ kind: 'potShare', pct: 25 }],
    text: {
      en: 'The government announces a bailout. Not for you — but a clerical error sends you {pct}% of the bailout fund (${amount}).',
      ru: 'Правительство объявляет помощь. Не вам — но из-за ошибки клерка вы получаете {pct}% фонда помощи (${amount}).',
    },
  },
  // Economic disasters
  {
    id: 'eco_student_interest', deck: 'chance', category: 'economic',
    effects: [{ kind: 'pay', amount: 500 }],
    text: {
      en: 'Your student loan provider celebrates record profits. Pay ${amount} in interest.',
      ru: 'Ваш кредитор по студенческому займу празднует рекордную прибыль. Заплатите ${amount} процентов.',
    },
  },
  {
    id: 'eco_ai_landlord', deck: 'chance', category: 'economic',
    effects: [{ kind: 'pay', amount: 400 }],
    text: {
      en: 'Your landlord introduces AI-powered rent optimization. Pay an additional ${amount}.',
      ru: 'Ваш арендодатель внедрил ИИ-оптимизацию аренды. Доплатите ${amount}.',
    },
  },
  {
    id: 'eco_rate_hike', deck: 'chance', category: 'economic',
    effects: [{ kind: 'economy', field: 'loanRate', factor: 1.25 }],
    text: {
      en: 'Interest rates rise to fight the inflation caused by raising interest rates. Loan interest +25%.',
      ru: 'Ставки повышают, чтобы бороться с инфляцией, вызванной повышением ставок. Проценты по кредитам +25%.',
    },
  },
  {
    id: 'eco_grocery', deck: 'chance', category: 'economic',
    effects: [{ kind: 'pay', amount: 300 }],
    text: {
      en: 'One bag of groceries now costs ${amount}. It contained mostly air. Pay up.',
      ru: 'Один пакет продуктов теперь стоит ${amount}. Внутри в основном воздух. Платите.',
    },
  },
  {
    id: 'eco_crash', deck: 'chance', category: 'economic',
    effects: [{ kind: 'percentCash', pct: 15 }],
    text: {
      en: 'Market correction! Pay {pct}% of your cash (${amount}) to "restore confidence".',
      ru: 'Коррекция рынка! Заплатите {pct}% своих наличных (${amount}), чтобы «восстановить доверие».',
    },
  },
  {
    id: 'eco_shrinkflation', deck: 'chance', category: 'economic',
    effects: [{ kind: 'percentCash', pct: 10 }],
    text: {
      en: 'Shrinkflation hits your wallet: it now holds {pct}% fewer dollars. Lose ${amount}.',
      ru: 'Шринкфляция добралась до кошелька: в нём на {pct}% меньше долларов. Потеряйте ${amount}.',
    },
  },
  {
    id: 'eco_rent_spike', deck: 'chance', category: 'economic',
    effects: [{ kind: 'economy', field: 'rentMult', factor: 1.15 }],
    text: {
      en: 'Rents everywhere rise 15%. Landlords call it "market dynamics".',
      ru: 'Аренда везде растёт на 15%. Арендодатели называют это «рыночной динамикой».',
    },
  },
  {
    id: 'eco_refinance', deck: 'chance', category: 'economic',
    effects: [{ kind: 'addLoan', amount: 1000 }, { kind: 'collect', amount: 1000, p: 'cash' }],
    text: {
      en: 'A bank refinances your debt into a bigger debt. ${amount} is added to your loan and ${cash} lands in your pocket.',
      ru: 'Банк рефинансирует ваш долг в долг побольше. К кредиту добавлено ${amount}, а в карман — ${cash}.',
    },
  },
  {
    id: 'eco_nearest_infra', deck: 'chance', category: 'economic',
    effects: [{ kind: 'nearest', target: 'infra', rentMult: 2 }],
    text: {
      en: 'Supply-chain shortage! Advance to the nearest Infrastructure Monopoly. If owned, pay double rent.',
      ru: 'Сбой цепочек поставок! Перейдите к ближайшей инфраструктурной монополии. Если она чья-то — двойная аренда.',
    },
  },
  {
    id: 'eco_nearest_utility', deck: 'chance', category: 'economic',
    effects: [{ kind: 'nearest', target: 'utility' }],
    text: {
      en: 'Heatwave! Advance to the nearest privatized utility and pay whatever they feel like.',
      ru: 'Жара! Перейдите к ближайшей приватизированной коммуналке и платите сколько скажут.',
    },
  },
  // Corporate privilege
  {
    id: 'corp_too_big', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'collect', amount: 1500 }],
    text: {
      en: 'Your corporation is officially too big to fail. Receive ${amount}.',
      ru: 'Ваша корпорация официально слишком большая, чтобы рухнуть. Получите ${amount}.',
    },
  },
  {
    id: 'corp_loophole', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'collect', amount: 1000 }],
    text: {
      en: 'Your accountant discovers a loophole previously available only to billionaires. Collect ${amount}.',
      ru: 'Ваш бухгалтер нашёл лазейку, раньше доступную только миллиардерам. Получите ${amount}.',
    },
  },
  {
    id: 'corp_pizza_party', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'collect', amount: 50 }],
    text: {
      en: 'Your employer announces record buybacks and a pizza party instead of raises. Collect ${amount} worth of pizza.',
      ru: 'Работодатель объявляет рекордный обратный выкуп акций и пицца-вечеринку вместо повышения. Получите пиццы на ${amount}.',
    },
  },
  {
    id: 'corp_ai_pivot', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'collect', amount: 1200 }],
    text: {
      en: 'Your startup pivots to AI. Investors send ${amount} without asking what it does.',
      ru: 'Ваш стартап переключился на ИИ. Инвесторы прислали ${amount}, не спросив, что он делает.',
    },
  },
  {
    id: 'corp_contractor', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'pay', amount: 600 }],
    text: {
      en: 'Restructuring! You are laid off and rehired as a contractor. Pay ${amount} for your own laptop.',
      ru: 'Реструктуризация! Вас уволили и наняли обратно подрядчиком. Заплатите ${amount} за собственный ноутбук.',
    },
  },
  {
    id: 'corp_merger', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'moveTo', space: 0 }],
    text: {
      en: 'Merger approved. Advance to Debt Collection — collect your salary and make the usual student loan payment.',
      ru: 'Слияние одобрено. Перейдите на «Взыскание долгов» — получите зарплату и внесите обычный платёж по студенческому займу.',
    },
  },
  {
    id: 'corp_trickle_up', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'transfer', from: 'poorest', amount: 300 }],
    text: {
      en: 'Trickle-up economics: the poorest player pays the richest player ${amount} as a "performance bonus".',
      ru: 'Экономика просачивания вверх: самый бедный игрок платит самому богатому ${amount} как «премию за эффективность».',
    },
  },
  {
    id: 'corp_subscription', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'perAsset', perProperty: 100, perUpgrade: 0 }],
    text: {
      en: 'Your front door now requires a subscription. Pay ${per} per property you own (${amount} total).',
      ru: 'Ваша входная дверь теперь работает по подписке. Заплатите ${per} за каждую собственность (всего ${amount}).',
    },
  },
  {
    id: 'corp_privatize', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'moveTo', space: 12 }],
    text: {
      en: 'The water company is privatized again. Advance to Thames Water (Brown).',
      ru: 'Водоканал снова приватизировали. Перейдите на «Thames Water (бурая)».',
    },
  },
  {
    id: 'corp_parachute', deck: 'chance', category: 'corporate',
    effects: [{ kind: 'forgiveLoan', amount: 1500 }],
    text: {
      en: 'Golden parachute! Up to ${amount} of your loan is forgiven.',
      ru: 'Золотой парашют! Вам прощают до ${amount} кредита.',
    },
  },
  {
    id: 'luck_consultant', deck: 'chance', category: 'luck',
    effects: [{
      kind: 'choice', options: [
        { label: { en: 'Pay for the course now', ru: 'Оплатить курс сейчас' }, effects: [{ kind: 'pay', amount: 300 }] },
        { label: { en: 'Finance it (+loan)', ru: 'В кредит (+долг)' }, effects: [{ kind: 'addLoan', amount: 500, p: 'loan' }] },
      ],
    }],
    text: {
      en: 'A consultant sells you a "financial wellness" course. Pay ${amount} now, or add ${loan} to your loan.',
      ru: 'Консультант продаёт вам курс «финансового благополучия». Заплатите ${amount} сейчас или добавьте ${loan} к кредиту.',
    },
  },
  {
    id: 'luck_penthouse', deck: 'chance', category: 'luck',
    effects: [{ kind: 'moveTo', space: 39 }],
    text: {
      en: 'A lobbyist insists you "just look" at Buy the Government. Advance there.',
      ru: 'Лоббист настаивает, чтобы вы «просто посмотрели» на «Купи правительство». Перейдите туда.',
    },
  },

  // ───────────── SOCIAL CONTRACT (community) ─────────────
  // Bureaucracy
  {
    id: 'bur_digitized', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'pay', amount: 250 }],
    text: {
      en: 'The government has digitized a form that still requires three in-person appointments. Pay ${amount}.',
      ru: 'Правительство оцифровало форму, которая всё ещё требует трёх личных визитов. Заплатите ${amount}.',
    },
  },
  {
    id: 'bur_stamp', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'pay', amount: 100 }],
    text: {
      en: 'Your stamp was stamped with the wrong stamp. Pay ${amount} for a new stamp.',
      ru: 'Вашу печать заверили не той печатью. Заплатите ${amount} за новую печать.',
    },
  },
  {
    id: 'bur_queue', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'moveBy', steps: -3 }],
    text: {
      en: 'You waited in line for 6 hours. The office closed. Move back {steps} spaces.',
      ru: 'Вы простояли в очереди 6 часов. Офис закрылся. Отступите на {steps} клетки.',
    },
  },
  {
    id: 'bur_lost_file', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'collect', amount: 200 }],
    text: {
      en: 'Your file was lost. Good news: so was your parking fine. Collect ${amount}.',
      ru: 'Ваше дело потеряли. Хорошая новость: штраф за парковку тоже. Получите ${amount}.',
    },
  },
  {
    id: 'bur_appeal', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'jailCard' }],
    text: {
      en: 'Appeal approved after four years. Receive a Get Out of Court card. Keep it until needed.',
      ru: 'Апелляцию одобрили спустя четыре года. Получите карту «Выйти из суда». Храните до случая.',
    },
  },
  {
    id: 'bur_permit', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'perAsset', perProperty: 50, perUpgrade: 150 }],
    text: {
      en: 'New permit rules! Pay ${per} per property and ${perUp} per renovation (${amount} total).',
      ru: 'Новые правила разрешений! Заплатите ${per} за собственность и ${perUp} за ремонт (всего ${amount}).',
    },
  },
  {
    id: 'bur_audit', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'pay', amount: 700 }],
    text: {
      en: 'Random audit! ("Random" means you.) Pay ${amount}.',
      ru: 'Случайная проверка! («Случайная» — значит вы.) Заплатите ${amount}.',
    },
  },
  {
    id: 'bur_wrong_window', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'goToJail' }],
    text: {
      en: 'Wrong window. Go to Immigration Court. Do not pass Start — silver lining: no student loan payment.',
      ru: 'Не то окно. Отправляйтесь в Миграционный суд. Старт не проходите — плюс: без платежа по займу.',
    },
  },
  {
    id: 'bur_refund_error', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'collect', amount: 600 }],
    text: {
      en: 'Tax office error in your favour. They will notice in 2031. Collect ${amount}.',
      ru: 'Ошибка налоговой в вашу пользу. Заметят в 2031-м. Получите ${amount}.',
    },
  },
  {
    id: 'bur_id_expired', deck: 'community', category: 'bureaucracy',
    effects: [{ kind: 'pay', amount: 200 }],
    text: {
      en: 'Your ID expired while you waited to renew your ID. Pay ${amount}.',
      ru: 'Ваш паспорт истёк, пока вы ждали замены паспорта. Заплатите ${amount}.',
    },
  },
  // Social absurdity
  {
    id: 'soc_inheritance', deck: 'community', category: 'social',
    effects: [{
      kind: 'choice', options: [
        { label: { en: 'Accept the apartment', ru: 'Принять квартиру' }, effects: [{ kind: 'inherit', fallbackCash: 1000 }, { kind: 'pay', amount: 2000 }] },
        { label: { en: 'Decline politely', ru: 'Вежливо отказаться' }, effects: [] },
      ],
    }],
    text: {
      en: 'A distant relative left you an apartment. Unfortunately, it comes with ${amount} in unpaid taxes. Accept it?',
      ru: 'Дальний родственник оставил вам квартиру. К сожалению, вместе с ${amount} неуплаченных налогов. Принять?',
    },
  },
  {
    id: 'soc_birthday', deck: 'community', category: 'social',
    effects: [{ kind: 'collectEach', amount: 100 }],
    text: {
      en: "It's your birthday! Each player gives you ${amount} in gift cards for your rent.",
      ru: 'У вас день рождения! Каждый игрок дарит вам ${amount} подарочными картами на аренду.',
    },
  },
  {
    id: 'soc_weddings', deck: 'community', category: 'social',
    effects: [{ kind: 'payEach', amount: 100 }],
    text: {
      en: "You're invited to seven weddings this summer. Pay each player ${amount}.",
      ru: 'Вас пригласили на семь свадеб этим летом. Заплатите каждому игроку ${amount}.',
    },
  },
  {
    id: 'soc_viral', deck: 'community', category: 'social',
    effects: [{ kind: 'collect', amount: 500 }],
    text: {
      en: 'Your rant about rent goes viral. Brands pay you ${amount} to stop.',
      ru: 'Ваша тирада об аренде стала вирусной. Бренды платят ${amount}, чтобы вы замолчали.',
    },
  },
  {
    id: 'soc_avocado', deck: 'community', category: 'social',
    effects: [{ kind: 'pay', amount: 50 }],
    text: {
      en: 'You bought avocado toast. Economists blame you for the housing crisis. Pay ${amount}.',
      ru: 'Вы купили тост с авокадо. Экономисты обвиняют вас в жилищном кризисе. Заплатите ${amount}.',
    },
  },
  {
    id: 'soc_roommates', deck: 'community', category: 'social',
    effects: [{ kind: 'collect', amount: 400 }],
    text: {
      en: 'You now have four roommates and a waiting list for the shower. Collect ${amount} in sublet income.',
      ru: 'У вас теперь четыре соседа и очередь в душ. Получите ${amount} от субаренды.',
    },
  },
  {
    id: 'soc_crowdfund', deck: 'community', category: 'social',
    effects: [{ kind: 'collect', amount: 300 }],
    text: {
      en: 'Your crowdfunding campaign for a dental filling succeeds. Collect ${amount}.',
      ru: 'Ваш краудфандинг на зубную пломбу удался. Получите ${amount}.',
    },
  },
  {
    id: 'soc_tax_rich', deck: 'community', category: 'social',
    effects: [{ kind: 'transfer', from: 'richest', amount: 400 }],
    text: {
      en: 'A "tax the rich" bill passes, briefly! The richest player pays the poorest player ${amount}.',
      ru: 'Закон «обложить богатых» принят — ненадолго! Самый богатый игрок платит самому бедному ${amount}.',
    },
  },
  {
    id: 'soc_parents', deck: 'community', category: 'social',
    effects: [{ kind: 'collect', amount: 700 }],
    text: {
      en: 'You move back in with your parents. Collect ${amount} in saved rent. Dignity not included.',
      ru: 'Вы вернулись жить к родителям. Получите ${amount} сэкономленной аренды. Достоинство не прилагается.',
    },
  },
  {
    id: 'soc_vacation', deck: 'community', category: 'social',
    effects: [{ kind: 'moveTo', space: 20 }],
    text: {
      en: 'You finally take a vacation… to the bailout office. Advance to Government Bailout.',
      ru: 'Вы наконец едете в отпуск… в офис господдержки. Перейдите на «Господдержку».',
    },
  },
  {
    id: 'soc_solidarity', deck: 'community', category: 'social',
    effects: [{ kind: 'collectEach', amount: 50 }],
    text: {
      en: 'General strike! Every player chips in ${amount} to your solidarity fund.',
      ru: 'Всеобщая забастовка! Каждый игрок скидывает ${amount} в ваш фонд солидарности.',
    },
  },
  // Random luck
  {
    id: 'luck_lottery', deck: 'community', category: 'luck',
    effects: [{ kind: 'collect', amount: 250 }],
    text: {
      en: 'You win the lottery! After taxes, fees and a commemorative mug, collect ${amount}.',
      ru: 'Вы выиграли в лотерею! После налогов, сборов и памятной кружки получите ${amount}.',
    },
  },
  {
    id: 'luck_old_coin', deck: 'community', category: 'luck',
    effects: [{ kind: 'collect', amount: 100 }],
    text: {
      en: 'You find a coin from 2019, back when things were affordable. Collect ${amount}.',
      ru: 'Вы нашли монету из 2019-го, когда всё было по карману. Получите ${amount}.',
    },
  },
  {
    id: 'luck_wallet', deck: 'community', category: 'luck',
    effects: [{ kind: 'forgiveLoan', amount: 300 }],
    text: {
      en: 'You return a lost wallet. Its owner is a banker and forgives up to ${amount} of your loan.',
      ru: 'Вы вернули потерянный кошелёк. Владелец — банкир, он прощает вам до ${amount} кредита.',
    },
  },
  {
    id: 'luck_shortcut', deck: 'community', category: 'luck',
    effects: [{ kind: 'moveBy', steps: 3 }],
    text: {
      en: 'Shortcut through a mall parking lot. Advance {steps} spaces.',
      ru: 'Срезали через парковку торгового центра. Пройдите вперёд на {steps} клетки.',
    },
  },
  {
    id: 'luck_tipjar', deck: 'community', category: 'luck',
    effects: [{ kind: 'collect', amount: 150 }],
    text: {
      en: 'Your tip jar fills up overnight. Collect ${amount}.',
      ru: 'Банка для чаевых наполнилась за ночь. Получите ${amount}.',
    },
  },
  {
    id: 'luck_flood', deck: 'community', category: 'luck',
    effects: [{ kind: 'pay', amount: 450 }],
    text: {
      en: 'Your basement floods. Insurance covers every act of God except this one. Pay ${amount}.',
      ru: 'Затопило подвал. Страховка покрывает все форс-мажоры, кроме этого. Заплатите ${amount}.',
    },
  },
  {
    id: 'luck_slot', deck: 'community', category: 'luck',
    effects: [{ kind: 'pay', amount: 100 }],
    text: {
      en: 'The slot machine says "almost". Pay ${amount}.',
      ru: 'Игровой автомат говорит «почти». Заплатите ${amount}.',
    },
  },
  {
    id: 'luck_start', deck: 'community', category: 'luck',
    effects: [{ kind: 'moveTo', space: 0 }],
    text: {
      en: 'Advance to Debt Collection. Collect your salary; the student loan collects you.',
      ru: 'Перейдите на «Взыскание долгов». Получите зарплату; студенческий заём получит вас.',
    },
  },
  {
    id: 'luck_everything_fine', deck: 'community', category: 'economic',
    effects: [{ kind: 'economy', field: 'priceMult', factor: 1.1 }],
    text: {
      en: 'The central bank announces that everything is fine. All purchase prices rise 10%.',
      ru: 'Центробанк объявляет, что всё в порядке. Все цены покупки растут на 10%.',
    },
  },
  {
    id: 'corp_gig_bonus', deck: 'community', category: 'corporate',
    effects: [{ kind: 'pay', amount: 120 }],
    text: {
      en: 'Your delivery app charges you a ${amount} "driver appreciation fee" for being a driver.',
      ru: 'Приложение доставки берёт с вас ${amount} «сбора благодарности курьеру» за то, что вы курьер.',
    },
  },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
