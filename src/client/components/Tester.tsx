/** Tester mode: a library of every hidden text, and cheat tools for tester rooms. */
import { useEffect, useMemo, useState } from 'react';
import { BOARD } from '../../shared/board';
import type { GameView, TesterLibrary } from '../../shared/view';
import { store, useStore } from '../store';
import { useT } from '../i18n';
import { Modal } from './common';

type LibTab = 'cards' | 'quiz' | 'inflation';

function useLibrary() {
  const [lib, setLib] = useState<TesterLibrary | null>(null);
  useEffect(() => {
    let live = true;
    void store.testerLibrary().then((l) => live && setLib(l));
    return () => {
      live = false;
    };
  }, []);
  return lib;
}

export function LibraryModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const lib = useLibrary();
  const [tab, setTab] = useState<LibTab>('cards');
  const [q, setQ] = useState('');
  const match = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal title={t('tester.library')} onClose={onClose} wide className="library-modal">
      <div className="library-bar">
        <nav className="tabs" role="tablist">
          {(['cards', 'quiz', 'inflation'] as LibTab[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(`tester.tab.${k}`)}{lib && ` (${lib[k].length})`}
            </button>
          ))}
        </nav>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tester.search')} aria-label={t('tester.search')} />
      </div>
      {!lib ? <p className="muted">{t('common.connecting')}</p> : (
        <div className="library-list">
          {tab === 'cards' && (['chance', 'community'] as const).map((deck) => (
            <section key={deck}>
              <h3>{t(deck === 'chance' ? 'card.chance' : 'card.community')}</h3>
              {lib.cards.filter((c) => c.deck === deck && match(c.id, c.text[lang])).map((c) => (
                <article key={c.id} className={`lib-card deck-${deck}`}>
                  <header><code>{c.id}</code><span className="badge">{c.category}</span></header>
                  <p>{c.text[lang]}</p>
                  {c.choices.length > 0 && <ul className="lib-choices">{c.choices.map((o, i) => <li key={i}>{o[lang]}</li>)}</ul>}
                </article>
              ))}
            </section>
          ))}
          {tab === 'quiz' && lib.quiz.filter((x) => match(x.id, x.q[lang])).map((x, n) => (
            <article key={x.id} className="lib-card">
              <header><code>{n + 1}. {x.id}</code></header>
              <p>{x.q[lang]}</p>
              <ol className="lib-options">
                {x.options.map((o, i) => <li key={i} className={i === x.answer ? 'right' : ''}>{o[lang]}{i === x.answer && <strong> ✓ {t('tester.correct')}</strong>}</li>)}
              </ol>
            </article>
          ))}
          {tab === 'inflation' && lib.inflation.filter((x) => match(x.id, x.text[lang])).map((x) => (
            <article key={x.id} className="lib-card deck-inflation">
              <header><code>{x.id}</code><span className="badge">{t('tester.weight', { n: x.weight })}</span></header>
              <p>{x.text[lang].replace(/\$\{\w+\}/g, '')}</p>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function TesterModal({ view, onClose }: { view: GameView; onClose: () => void }) {
  const { t, spaceName } = useT();
  const lib = useLibrary();
  const [library, setLibrary] = useState(false);
  const [d1, setD1] = useState(6);
  const [d2, setD2] = useState(6);
  const [space, setSpace] = useState(7);
  const [cardId, setCardId] = useState('');
  const cards = useMemo(() => lib?.cards ?? [], [lib]);
  const lang = useStore((s) => s.lang);
  const isHost = view.hostId === view.you;
  const cur = view.players[view.current];
  const canMove = isHost && view.phase === 'preRoll';
  const die = (v: number, set: (n: number) => void, label: string) => (
    <select value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label}>
      {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  if (library) return <LibraryModal onClose={() => setLibrary(false)} />;
  return (
    <Modal title={t('tester.tools')} onClose={onClose} className="tester-modal">
      {!isHost && <p className="hint">{t('tester.hostOnly')}</p>}
      <section className="tester-tool">
        <h4>{t('tester.dice')}</h4>
        <div className="btn-row">
          {die(d1, setD1, t('tester.die1'))}{die(d2, setD2, t('tester.die2'))}
          <button className="secondary small" disabled={!isHost} onClick={() => store.act({ type: 'testDice', d1, d2 })}>{t('tester.setDice')}</button>
          {(view.testDice?.length ?? 0) > 0 && <span className="hint">{t('tester.queued', { list: view.testDice!.map(([a, b]) => `${a}+${b}`).join(', ') })}</span>}
        </div>
      </section>
      <section className="tester-tool">
        <h4>{t('tester.move', { name: cur?.name ?? '' })}</h4>
        <div className="btn-row">
          <select value={space} onChange={(e) => setSpace(Number(e.target.value))} aria-label={t('tester.space')}>
            {BOARD.map((d) => <option key={d.index} value={d.index}>{d.index}. {spaceName(d.index)}</option>)}
          </select>
          <button className="secondary small" disabled={!canMove} onClick={() => store.act({ type: 'testMoveTo', space })}>{t('tester.go')}</button>
        </div>
        {!canMove && isHost && <p className="hint">{t('tester.moveHint')}</p>}
      </section>
      <section className="tester-tool">
        <h4>{t('tester.stack')}</h4>
        <div className="btn-row">
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} aria-label={t('tester.card')} className="card-select">
            <option value="">{t('tester.pickCard')}</option>
            {(['chance', 'community'] as const).map((deck) => (
              <optgroup key={deck} label={t(deck === 'chance' ? 'card.chance' : 'card.community')}>
                {cards.filter((c) => c.deck === deck).map((c) => <option key={c.id} value={c.id}>{c.text[lang].slice(0, 70)}</option>)}
              </optgroup>
            ))}
          </select>
          <button className="secondary small" disabled={!isHost || !cardId} onClick={() => store.act({ type: 'testStackCard', cardId })}>{t('tester.stackIt')}</button>
        </div>
        <p className="hint">{t('tester.stackHint')}</p>
      </section>
      <section className="tester-tool">
        <h4>{t('tester.cash')}</h4>
        <div className="btn-row">
          {[1000, 10000, -1000].map((n) => (
            <button key={n} className={n > 0 ? 'secondary small' : 'ghost small'} disabled={!isHost} onClick={() => store.act({ type: 'testCash', amount: n })}>
              {n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}
            </button>
          ))}
        </div>
      </section>
      <button className="primary" onClick={() => setLibrary(true)}>{t('tester.openLibrary')}</button>
    </Modal>
  );
}
