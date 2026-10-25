import { useEffect, useRef, useState } from 'react';
import { GROUP_COLORS, BOARD, RULES } from '../../shared/board';
import { allied, ownedBy, wealthOf } from '../../shared/rules';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { Countdown } from './common';
import { TokenIcon } from './icons';
import { asState } from './Center';
import { TradeCard } from './TradeModal';

export function ChatBox({ view }: { view: GameView }) {
  const { t } = useT();
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [view.chat.length]);
  const send = async () => {
    const v = text.trim();
    if (!v) return;
    if (await store.act({ type: 'chat', text: v })) setText('');
  };
  return (
    <div className="chat">
      <div className="chat-list" ref={list}>
        {view.chat.length === 0 && <p className="muted center-text">{t('chat.empty')}</p>}
        {view.chat.map((m) => {
          const p = view.players.find((x) => x.id === m.playerId);
          return (
            <div key={m.id} className={`chat-msg ${m.playerId === view.you ? 'mine' : ''}`}>
              <span className="who" style={{ color: p?.color }}>{p?.name ?? '?'}</span>
              <span className="txt">{m.text}</span>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} maxLength={RULES.chatMaxLength} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} />
        <button className="primary small" disabled={!text.trim()}>{t('chat.send')}</button>
      </form>
    </div>
  );
}

function LogList({ view }: { view: GameView }) {
  const { logText } = useT();
  const items = view.log.slice(-120).reverse();
  return (
    <ul className="log-list">
      {items.map((l) => (
        <li key={l.seq} className={`log-${l.key.replace('log.', '')}`}>{logText(l, view)}</li>
      ))}
    </ul>
  );
}

function MoneyList({ view }: { view: GameView }) {
  const { t, money } = useT();
  const name = (id: string) => (id === 'bank' ? t('common.bank') : id === 'pot' ? t('common.pot') : view.players.find((p) => p.id === id)?.name ?? '?');
  const items = view.transactions.slice(-100).reverse();
  if (!items.length) return <p className="muted center-text">{t('money.empty')}</p>;
  return (
    <table className="tx-table">
      <tbody>
        {items.map((x) => (
          <tr key={x.seq} className={x.to === view.you ? 'in' : x.from === view.you ? 'out' : ''}>
            <td className="r">{t('common.round', { n: x.round })}</td>
            <td>{name(x.from)} → {name(x.to)}</td>
            <td className="amt">{money(x.amount)}</td>
            <td className="why">{t(x.reasonKey)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Deals({ view, onTrade }: { view: GameView; onTrade: (toId?: string, counterOf?: string) => void }) {
  const { t } = useT();
  const pending = view.trades.filter((x) => x.status === 'pending');
  const closed = view.trades.filter((x) => x.status !== 'pending').slice(-6).reverse();
  const proposals = view.allianceProposals.filter((a) => a.toId === view.you);
  const mine = view.alliances.filter((a) => a.a === view.you || a.b === view.you);
  const me = view.players.find((p) => p.id === view.you);
  return (
    <div className="deals">
      {me && !me.bankrupt && view.status === 'playing' && <button className="primary small" onClick={() => onTrade()}>{t('hud.trade')}</button>}
      {pending.length === 0 && closed.length === 0 && <p className="muted">{t('trade.none')}</p>}
      {pending.map((tr) => <TradeCard key={tr.id} view={view} trade={tr} onCounter={() => onTrade(tr.fromId, tr.id)} />)}
      {closed.map((tr) => <TradeCard key={tr.id} view={view} trade={tr} />)}
      <h4>{t('alliance.title')}</h4>
      <p className="muted small">{t('alliance.info', { pct: RULES.allianceRentDiscount * 100, n: RULES.allianceRounds })}</p>
      {proposals.map((a) => {
        const from = view.players.find((p) => p.id === a.fromId);
        return (
          <div key={a.fromId} className="alliance-prop">
            <span>{t('alliance.from', { name: from?.name ?? '?' })} <Countdown until={a.expiresAt} /></span>
            <div className="btn-row">
              <button className="primary small" onClick={() => store.act({ type: 'allianceRespond', fromId: a.fromId, accept: true })}>{t('alliance.accept')}</button>
              <button className="ghost small" onClick={() => store.act({ type: 'allianceRespond', fromId: a.fromId, accept: false })}>{t('alliance.decline')}</button>
            </div>
          </div>
        );
      })}
      {mine.map((a) => {
        const other = view.players.find((p) => p.id === (a.a === view.you ? a.b : a.a));
        return (
          <div key={`${a.a}${a.b}`} className="alliance-row">
            <span>{t('alliance.with', { name: other?.name ?? '?', n: a.expiresRound })}</span>
            <button className="danger small" onClick={() => store.act({ type: 'allianceBreak', withId: other!.id })}>{t('alliance.break')}</button>
          </div>
        );
      })}
    </div>
  );
}

export type SideTab = 'chat' | 'log' | 'money' | 'trades';

export function SidePanel({ view, tab, setTab, onTrade }: { view: GameView; tab: SideTab; setTab: (t: SideTab) => void; onTrade: (toId?: string, counterOf?: string) => void }) {
  const { t } = useT();
  const incoming = view.trades.filter((x) => x.status === 'pending' && x.toId === view.you).length
    + view.allianceProposals.filter((a) => a.toId === view.you).length;
  return (
    <aside className="side-panel">
      <nav className="tabs" role="tablist">
        {(['chat', 'log', 'money', 'trades'] as SideTab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`tab.${k}`)}
            {k === 'trades' && incoming > 0 && <span className="dot">{incoming}</span>}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'chat' && <ChatBox view={view} />}
        {tab === 'log' && <LogList view={view} />}
        {tab === 'money' && <MoneyList view={view} />}
        {tab === 'trades' && <Deals view={view} onTrade={onTrade} />}
      </div>
    </aside>
  );
}

export function PlayersPanel({ view, onTrade, onSelectSpace }: { view: GameView; onTrade: (toId?: string) => void; onSelectSpace: (i: number) => void }) {
  const { t, money } = useT();
  const s = asState(view);
  const cur = view.players[view.current];
  const me = view.players.find((p) => p.id === view.you);
  return (
    <section className="players-panel">
      {view.players.map((p) => {
        const owned = ownedBy(s, p.id);
        const debt = view.debts.filter((d) => d.debtorId === p.id).reduce((n, d) => n + d.amount, 0);
        const w = wealthOf(s, p);
        const ally = me && p.id !== me.id && allied(s, me.id, p.id);
        return (
          <article key={p.id} className={`player-card${p.id === cur?.id ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}`} style={{ borderColor: p.color }}>
            <header>
              <span className="tok" style={{ background: p.color }}><TokenIcon token={p.token} size={20} color="#f4ecd8" /></span>
              <span className="nm">{p.name}{p.id === view.you && <em> ({t('common.you')})</em>}</span>
              {!p.connected && <span className="badge warn">{t('hud.disconnected')}</span>}
              {p.inJail && <span className="badge">{t('hud.inJail')}</span>}
              {ally && <span className="badge ok">{t('hud.ally')}</span>}
              {p.bankrupt && <span className="badge bad">{t('hud.bankrupt')}</span>}
            </header>
            {!p.bankrupt && (
              <dl className="stats">
                <div><dt>{t('hud.cash')}</dt><dd className="cash">{money(p.cash)}</dd></div>
                {p.loan > 0 && <div><dt>{t('hud.loan')}</dt><dd className="neg">{money(p.loan)}</dd></div>}
                {debt > 0 && <div><dt>{t('hud.debt')}</dt><dd className="neg">{money(debt)}</dd></div>}
                <div><dt>{t('hud.net')}</dt><dd>{money(w.total)}</dd></div>
              </dl>
            )}
            {owned.length > 0 && (
              <div className="owned-chips">
                {owned.map((i) => {
                  const d = BOARD[i];
                  const o = view.properties[i];
                  return (
                    <button key={i} className={`chip${o.mortgaged ? ' mortgaged' : ''}`} style={{ background: d.group ? GROUP_COLORS[d.group] : '#5c6b7a' }} title={t(`spaces.${d.key}`)} onClick={() => onSelectSpace(i)}>
                      {o.upgrades > 0 ? (o.upgrades === 5 ? '★' : o.upgrades) : ''}
                    </button>
                  );
                })}
              </div>
            )}
            {me && !me.bankrupt && !p.bankrupt && p.id !== me.id && view.status === 'playing' && (
              <div className="player-actions">
                <button className="ghost small" onClick={() => onTrade(p.id)}>{t('hud.trade')}</button>
                {!ally && <button className="ghost small" onClick={() => store.act({ type: 'alliancePropose', toId: p.id })}>{t('alliance.propose')}</button>}
              </div>
            )}
          </article>
        );
      })}
      <EconomyBox view={view} />
    </section>
  );
}

function EconomyBox({ view }: { view: GameView }) {
  const { t, num } = useT();
  const ec = view.economy;
  return (
    <div className="economy">
      <h4>{t('hud.economy')}</h4>
      <div className="econ-grid">
        <span className={ec.rentMult > 1 ? 'up' : ''}>{t('hud.rentIdx', { v: num(ec.rentMult) })}</span>
        <span className={ec.costMult > 1 ? 'up' : ''}>{t('hud.costIdx', { v: num(ec.costMult) })}</span>
        <span className={ec.priceMult > 1 ? 'up' : ''}>{t('hud.priceIdx', { v: num(ec.priceMult) })}</span>
        <span className={ec.loanRate > RULES.loanBaseRate ? 'up' : ''}>{t('hud.loanRate', { v: num(Math.round(ec.loanRate * 1000) / 10) })}</span>
        <span>{t('hud.pot', { v: num(ec.bailoutPot) })}</span>
        <span>{t('hud.salary', { v: num(view.config.salary) })}</span>
      </div>
    </div>
  );
}
