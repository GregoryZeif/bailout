import { useEffect, useState } from 'react';
import { BOARD, RULES } from '../../shared/board';
import { availableCredit, currentPrice, luxuryTax } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { ConfirmButton, Countdown } from './common';
import { Die } from './icons';

export const asState = (v: GameView) => v as unknown as GameState;

function DiceView({ view }: { view: GameView }) {
  const [rolling, setRolling] = useState(false);
  useEffect(() => store.onEvents((events) => {
    if (events.some((e) => e.type === 'dice')) {
      setRolling(true);
      setTimeout(() => setRolling(false), 600);
    }
  }), []);
  const d = view.lastDice ?? [1, 1];
  return (
    <div className="dice" aria-live="polite">
      <Die value={rolling ? 1 + Math.floor(Math.random() * 6) : d[0]} rolling={rolling} />
      <Die value={rolling ? 1 + Math.floor(Math.random() * 6) : d[1]} rolling={rolling} />
    </div>
  );
}

export function Center({ view, onOpenPortfolio }: { view: GameView; onOpenPortfolio: () => void }) {
  const { t, money, spaceName } = useT();
  const me = view.players.find((p) => p.id === view.you);
  const cur = view.players[view.current];
  const myTurn = cur?.id === view.you;
  const s = asState(view);

  if (view.status === 'finished') {
    return <div className="center"><div className="turn-banner">{t('end.title')}</div></div>;
  }
  return (
    <div className="center">
      <div className="center-head">
        <span className="round">{t('common.round', { n: view.round })}</span>
        {view.endsAt && <span className="game-clock" title={t('common.timeLeft')}>⏱ <Countdown until={view.endsAt} /></span>}
      </div>
      <div className={`turn-banner ${myTurn ? 'mine' : ''}`} style={{ borderColor: cur?.color }}>
        {myTurn ? t('hud.yourTurn') : t('hud.turnOf', { name: cur?.name ?? '' })}
        {view.phase !== 'auction' && <Countdown until={view.phase === 'debt' ? view.turnEndsAt : view.turnEndsAt} total={view.phase === 'debt' ? RULES.debtSeconds : view.phase === 'quiz' ? RULES.quizSeconds : view.config.turnSeconds} />}
      </div>
      <DiceView view={view} />
      <div className="center-actions">
        <PhaseActions view={view} onOpenPortfolio={onOpenPortfolio} />
      </div>
      {view.lastCard && view.phase !== 'cardChoice' && (
        <div className="last-card-mini" title={t('card.drewBy', { name: view.players.find((p) => p.id === view.lastCard!.playerId)?.name ?? '' })}>
          <LastCard view={view} />
        </div>
      )}
      {me && !me.bankrupt && myTurn && view.phase === 'awaitBuy' && (
        <p className="sub">{t('prompt.buy', { space: spaceName(me.position) })} · {money(currentPrice(s, me.position))}</p>
      )}
    </div>
  );
}

function LastCard({ view }: { view: GameView }) {
  const { cardText, deckName } = useT();
  const c = view.lastCard!;
  return (
    <>
      <strong>{deckName(c.cardId)}:</strong> {cardText(c.cardId, c.params)}
    </>
  );
}

function PhaseActions({ view, onOpenPortfolio }: { view: GameView; onOpenPortfolio: () => void }) {
  const { t, money, spaceName } = useT();
  const me = view.players.find((p) => p.id === view.you);
  const cur = view.players[view.current];
  const myTurn = cur?.id === view.you && !!me && !me.bankrupt;
  const s = asState(view);
  const act = store.act.bind(store);

  if (view.phase === 'auction' && view.auction) return <AuctionBox view={view} />;

  if (view.phase === 'debt' && view.debts[0]) {
    const d = view.debts[0];
    const debtor = view.players.find((p) => p.id === d.debtorId)!;
    const to = d.creditor === 'bank' ? t('common.bank') : view.players.find((p) => p.id === d.creditor)?.name ?? '?';
    if (debtor.id !== view.you) return <p className="waiting">{t('prompt.debtOther', { name: debtor.name, amount: money(d.amount), to })}</p>;
    return (
      <div className="debt-box">
        <p className="alert">{t('prompt.debt', { amount: money(d.amount), to })}</p>
        <div className="btn-row">
          <button className="primary" disabled={debtor.cash < d.amount} onClick={() => act({ type: 'settleDebt' })} data-testid="settle">{t('act.settle', { amount: d.amount })}</button>
          <button className="secondary" onClick={onOpenPortfolio}>{t('act.manage')}</button>
        </div>
        <ConfirmButton className="danger ghost" confirmText={t('act.bankrupt') + '?'} onConfirm={() => act({ type: 'declareBankruptcy' })}>
          {t('act.bankrupt')}
        </ConfirmButton>
        <p className="hint">{t('prompt.debtTimer')}</p>
      </div>
    );
  }

  if (!myTurn) {
    if (view.phase === 'quiz') return <p className="waiting">{t('quiz.watching', { name: cur?.name ?? '' })}</p>;
    return <p className="waiting">{t('hud.waiting', { name: cur?.name ?? '' })}</p>;
  }

  switch (view.phase) {
    case 'preRoll':
      if (me!.inJail) {
        return (
          <div className="jail-box">
            <p>{t('prompt.jail', { n: me!.jailTurns + 1, max: RULES.jailMaxTurns })}</p>
            <div className="btn-grid">
              <button className="primary" disabled={me!.cash < RULES.jailFee} onClick={() => act({ type: 'jailPay' })}>{t('act.jailPay', { amount: RULES.jailFee })}</button>
              <button className="secondary" disabled={me!.jailCards < 1} onClick={() => act({ type: 'jailCard' })}>{t('act.jailCard')} ({me!.jailCards})</button>
              <button className="secondary" disabled={me!.quizTakenThisTurn} onClick={() => act({ type: 'quizStart' })} data-testid="quiz">{t('act.quiz')}</button>
              <button className="ghost" onClick={() => act({ type: 'jailRoll13' })} title={t('act.roll13Hint')}>{t('act.roll13')}</button>
            </div>
            <p className="hint">{t('prompt.jailMax', { max: RULES.jailMaxTurns })}</p>
          </div>
        );
      }
      return (
        <button className="primary big roll-btn" onClick={() => act({ type: 'roll' })} data-testid="roll">
          {view.doublesCount > 0 ? t('act.rollAgain') : t('act.roll')}
        </button>
      );
    case 'awaitBuy': {
      const space = me!.position;
      const price = currentPrice(s, space);
      const lux = luxuryTax(s, space);
      const total = price + lux;
      const short = total - me!.cash;
      const credit = availableCredit(s, me!);
      const borrow = Math.ceil(short / RULES.loanStep) * RULES.loanStep;
      return (
        <div className="buy-box">
          <div className="btn-row">
            <button className="primary" disabled={short > 0} onClick={() => act({ type: 'buy' })} data-testid="buy">
              {lux ? t('act.buyLux', { amount: price, lux }) : t('act.buy', { amount: price })}
            </button>
            <button className="secondary" onClick={() => act({ type: 'decline' })} data-testid="decline">{t('act.decline')}</button>
          </div>
          {short > 0 && (
            <>
              <p className="hint">{t('prompt.cantAfford')}</p>
              {borrow <= credit && <button className="ghost" onClick={() => act({ type: 'borrow', amount: borrow })}>{t('act.borrowFor', { amount: borrow })}</button>}
            </>
          )}
          <span className="sr-only">{spaceName(space)}</span>
        </div>
      );
    }
    case 'postRoll':
      return (
        <div className="post-box">
          <p className="hint">{t('prompt.postRoll')}</p>
          <button className="primary big" onClick={() => act({ type: 'endTurn' })} data-testid="end-turn">{t('act.endTurn')}</button>
        </div>
      );
    case 'quiz':
    case 'cardChoice':
      return null; // overlays handle these
    default:
      return null;
  }
}

function AuctionBox({ view }: { view: GameView }) {
  const { t, money, spaceName } = useT();
  const a = view.auction!;
  const me = view.players.find((p) => p.id === view.you);
  const high = a.highBidderId ? view.players.find((p) => p.id === a.highBidderId) : null;
  const min = a.highBid > 0 ? a.highBid + RULES.auctionMinIncrement : RULES.auctionMinIncrement;
  const [custom, setCustom] = useState('');
  const passed = me ? a.passed.includes(me.id) : true;
  const canBid = me && !me.bankrupt && !passed && a.highBidderId !== me.id;
  const bid = (amount: number) => store.act({ type: 'bid', amount });
  return (
    <div className="auction-box" data-testid="auction">
      <h4>{t('auction.title', { space: spaceName(a.space) })} <Countdown until={a.endsAt} total={view.config.auctionSeconds} /></h4>
      <p className="muted">{t('auction.listPrice', { amount: BOARD[a.space].price ?? 0 })}</p>
      <p className="high">{high ? t('auction.high', { amount: a.highBid, name: high.name }) : t('auction.noBids', { amount: min })}</p>
      {canBid ? (
        <>
          <div className="btn-row">
            {[min, min + 400, min + 900].map((v) => (
              <button key={v} className="primary small" disabled={v > me!.cash} onClick={() => bid(v)}>{money(v)}</button>
            ))}
          </div>
          <form className="btn-row" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(custom) / 10) * 10; if (n) void bid(n); setCustom(''); }}>
            <input type="number" min={min} step={10} placeholder={t('auction.custom')} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="secondary small">{t('auction.bidBtn')}</button>
            <button type="button" className="ghost small" onClick={() => store.act({ type: 'passAuction' })}>{t('act.pass')}</button>
          </form>
        </>
      ) : (
        passed && <p className="muted">{t('auction.passed')}</p>
      )}
    </div>
  );
}
