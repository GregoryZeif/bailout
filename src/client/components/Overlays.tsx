import { useEffect, useRef, useState } from 'react';
import { RULES } from '../../shared/board';
import { CARD_BY_ID, type CardEffect } from '../../shared/cards';
import { QUIZ_BY_ID } from '../../shared/quiz';
import { scaled } from '../../shared/rules';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { Countdown, Modal } from './common';
import { asState } from './Center';

/** Shows newly drawn cards and inflation events; handles card choices. */
export function CardOverlay({ view }: { view: GameView }) {
  const { t, cardText, deckName, inflationText } = useT();
  const seen = useRef<number>(Math.max(view.lastCard?.seq ?? 0, view.lastInflation?.seq ?? 0));
  const [show, setShow] = useState<'card' | 'inflation' | null>(null);

  useEffect(() => {
    const cs = view.lastCard?.seq ?? 0;
    const is = view.lastInflation?.seq ?? 0;
    if (is > seen.current && is >= cs) {
      seen.current = is;
      setShow('inflation');
    } else if (cs > seen.current) {
      seen.current = cs;
      setShow('card');
    }
  }, [view.lastCard?.seq, view.lastInflation?.seq]);

  // auto-dismiss informational cards
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(null), 6500);
    return () => clearTimeout(id);
  }, [show]);

  const choosing = view.phase === 'cardChoice' && view.pendingCard?.playerId === view.you;
  if (choosing) {
    const c = view.lastCard!;
    const def = CARD_BY_ID[c.cardId];
    const choice = def.effects.find((e) => e.kind === 'choice') as Extract<CardEffect, { kind: 'choice' }>;
    return (
      <Modal title={deckName(c.cardId)} className={`card-modal deck-${def.deck}`}>
        <p className="card-text">{cardText(c.cardId, c.params)}</p>
        <p className="muted">{t('card.choose')} <Countdown until={view.turnEndsAt} total={view.config.turnSeconds} /></p>
        <div className="btn-col">
          {choice.options.map((o, i) => (
            <button key={i} className={i === 0 ? 'primary' : 'secondary'} onClick={() => store.act({ type: 'cardChoice', option: i })}>
              {o.label[store.state.lang]}
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (show === 'inflation' && view.lastInflation) {
    const inf = view.lastInflation;
    return (
      <Modal title={t('card.inflation', { n: inf.round })} onClose={() => setShow(null)} className="card-modal inflation">
        <svg className="inflation-art" viewBox="0 0 120 60" aria-hidden>
          <path d="M5 55h110" stroke="currentColor" strokeWidth="2" />
          <path d="M8 48l22-8 16 6 20-18 14 6 30-28" fill="none" stroke="#c0392b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M100 4h12v12" fill="none" stroke="#c0392b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="card-text">{inflationText(inf.eventId, inf.params)}</p>
        <button className="primary" onClick={() => setShow(null)}>{t('card.ok')}</button>
      </Modal>
    );
  }
  if (show === 'card' && view.lastCard) {
    const c = view.lastCard;
    const who = view.players.find((p) => p.id === c.playerId)?.name ?? '';
    return (
      <Modal title={deckName(c.cardId)} onClose={() => setShow(null)} className={`card-modal deck-${CARD_BY_ID[c.cardId]?.deck}`}>
        <p className="muted">{t('card.drewBy', { name: who })}</p>
        <p className="card-text">{cardText(c.cardId, c.params)}</p>
        <button className="primary" onClick={() => setShow(null)}>{t('card.ok')}</button>
      </Modal>
    );
  }
  return null;
}

export function QuizOverlay({ view }: { view: GameView }) {
  const { t } = useT();
  const lang = store.state.lang;
  const seen = useRef(view.lastQuiz?.seq ?? 0);
  const [result, setResult] = useState<GameView['lastQuiz']>(null);

  useEffect(() => {
    const q = view.lastQuiz;
    if (q && q.seq > seen.current) {
      seen.current = q.seq;
      if (q.playerId === view.you) setResult(q);
    }
  }, [view.lastQuiz, view.you]);

  if (view.phase === 'quiz' && view.quiz?.playerId === view.you) {
    const q = view.quiz;
    const idx = q.answers.findIndex((a) => a === null);
    const question = QUIZ_BY_ID[q.questionIds[idx]];
    if (!question) return null;
    return (
      <Modal title={t('quiz.title')} className="quiz-modal">
        <p className="muted">{t('quiz.intro', { fee: scaled(asState(view), RULES.quizFailFee) })}</p>
        <p className="quiz-progress">{t('quiz.question', { n: idx + 1, total: q.questionIds.length })} · <Countdown until={view.turnEndsAt} total={RULES.quizSeconds} /></p>
        <h3 className="quiz-q">{question.q[lang]}</h3>
        <div className="btn-col">
          {question.options.map((o, i) => (
            <button key={i} className="secondary quiz-opt" onClick={() => store.act({ type: 'quizAnswer', index: idx, answer: i })}>
              {String.fromCharCode(65 + i)}. {o[lang]}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  if (result) {
    return (
      <Modal title={t('quiz.title')} onClose={() => setResult(null)} className="quiz-modal">
        <p className={`quiz-result ${result.passed ? 'ok' : 'bad'}`}>{result.passed ? t('quiz.passed') : t('quiz.failed')}</p>
        <ol className="quiz-review">
          {result.questionIds.map((id, i) => (
            <li key={id} className={result.correct[i] ? 'ok' : 'bad'}>
              {QUIZ_BY_ID[id]?.q[lang]} — <strong>{result.correct[i] ? t('quiz.correct') : t('quiz.wrong')}</strong>
            </li>
          ))}
        </ol>
        <button className="primary" onClick={() => setResult(null)}>{t('common.close')}</button>
      </Modal>
    );
  }
  return null;
}
