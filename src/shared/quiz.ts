/**
 * Citizenship Test questions. Purely fictional bureaucratic absurdity —
 * nothing here tests real-world nationality, ethnicity or knowledge.
 * Correct answers live in quizAnswers.ts, which only the engine imports,
 * so they never reach the client bundle.
 */
import type { Lang } from './types.js';

export interface QuizQuestion {
  id: string;
  q: Record<Lang, string>;
  options: Record<Lang, string>[];
}

const o = (en: string, ru: string) => ({ en, ru });

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q_forms',
    q: o('How many forms are required to prove you have already submitted the same form?', 'Сколько форм нужно, чтобы доказать, что вы уже подали ту же форму?'),
    options: [o('One', 'Одна'), o('Zero, we trust you', 'Ноль, мы вам верим'), o('One more than you brought', 'На одну больше, чем вы принесли')],
  },
  {
    id: 'q_office',
    q: o('Which office handles applications for the office that handles applications?', 'Какой офис принимает заявления в офис, принимающий заявления?'),
    options: [o('Room 101', 'Кабинет 101'), o('The office that handles applications, window 2 (closed)', 'Офис приёма заявлений, окно 2 (закрыто)'), o('Customer Happiness Desk', 'Стойка клиентского счастья')],
  },
  {
    id: 'q_rent',
    q: o('If your rent doubles and your salary stays the same, what is the official government response?', 'Если аренда удвоилась, а зарплата нет, каков официальный ответ правительства?'),
    options: [o('"Have you tried buying a house?"', '«А вы пробовали купить дом?»'), o('A rent freeze', 'Заморозка аренды'), o('A salary increase', 'Повышение зарплаты')],
  },
  {
    id: 'q_hours',
    q: o('The office is open 9:00–9:15 on alternate Tuesdays. When is the best time to arrive?', 'Офис работает с 9:00 до 9:15 через вторник. Когда лучше прийти?'),
    options: [o('9:00 on Tuesday', 'Во вторник в 9:00'), o('Online', 'Онлайн'), o('Last Tuesday', 'В прошлый вторник')],
  },
  {
    id: 'q_photo',
    q: o('What is the correct facial expression for an official document photo?', 'Какое выражение лица правильное для фото на документ?'),
    options: [o('A smile', 'Улыбка'), o('Quiet acceptance of your financial situation', 'Тихое принятие своего финансового положения'), o('Hope', 'Надежда')],
  },
  {
    id: 'q_ink',
    q: o('Your form was rejected for using blue ink. Which ink is accepted?', 'Форму отклонили из-за синих чернил. Какие принимаются?'),
    options: [o('The other blue', 'Другие синие'), o('Black', 'Чёрные'), o('Any ink', 'Любые')],
  },
  {
    id: 'q_appointment',
    q: o('The next available appointment is in 14 months. What should you do?', 'Ближайшая запись через 14 месяцев. Что делать?'),
    options: [o('Complain', 'Пожаловаться'), o('Come tomorrow anyway', 'Прийти завтра'), o('Book an appointment to request an earlier appointment', 'Записаться, чтобы попросить запись пораньше')],
  },
  {
    id: 'q_budget',
    q: o('The national budget has a surplus. Where does it go?', 'В бюджете профицит. Куда он идёт?'),
    options: [o('Schools and hospitals', 'В школы и больницы'), o('A committee to study where it should go', 'Комитету по изучению, куда его направить'), o('Back to taxpayers', 'Обратно налогоплательщикам')],
  },
  {
    id: 'q_copy',
    q: o('How many copies of your copy should you bring?', 'Сколько копий вашей копии нужно принести?'),
    options: [o('Three, notarized by a copy', 'Три, заверенные копией'), o('None', 'Ни одной'), o('Just the original', 'Только оригинал')],
  },
  {
    id: 'q_inflation',
    q: o('Prices rose 40%. According to official statistics, inflation was…', 'Цены выросли на 40%. По официальной статистике инфляция составила…'),
    options: [o('40%', '40%'), o('Higher', 'Больше'), o('Within target', 'В пределах цели')],
  },
  {
    id: 'q_landlord',
    q: o('Your landlord says the AI raised your rent. Who do you complain to?', 'Арендодатель говорит, что аренду поднял ИИ. Кому жаловаться?'),
    options: [o('The landlord', 'Арендодателю'), o('The AI customer support AI', 'ИИ поддержки ИИ'), o('A tenants\' union', 'Профсоюзу жильцов')],
  },
  {
    id: 'q_signature',
    q: o('Your signature does not match your signature. What happened?', 'Ваша подпись не совпадает с вашей подписью. Что случилось?'),
    options: [o('You need to sign the form confirming your signature', 'Нужно подписать форму, подтверждающую подпись'), o('Nothing', 'Ничего'), o('Identity theft', 'Кража личности')],
  },
  {
    id: 'q_number',
    q: o('You took queue number 47. Number 12 is being served. What does the display say next?', 'У вас талон 47. Обслуживают 12-й. Что покажет табло дальше?'),
    options: [o('13', '13'), o('47', '47'), o('Lunch break', 'Обеденный перерыв')],
  },
  {
    id: 'q_hotline',
    q: o('The helpline is "experiencing higher than usual call volumes". Since when?', 'На горячей линии «выше обычного количество звонков». С какого времени?'),
    options: [o('Today', 'С сегодняшнего дня'), o('Since the invention of the telephone', 'С изобретения телефона'), o('Since lunch', 'С обеда')],
  },
  {
    id: 'q_reform',
    q: o('A bureaucracy reform will reduce paperwork by creating…', 'Реформа бюрократии сократит бумажную работу, создав…'),
    options: [o('A new Ministry of Reduced Paperwork', 'Новое Министерство сокращения бумаг'), o('Fewer forms', 'Меньше форм'), o('An app that works', 'Работающее приложение')],
  },
];

export const QUIZ_BY_ID: Record<string, QuizQuestion> = Object.fromEntries(QUIZ.map((q) => [q.id, q]));
