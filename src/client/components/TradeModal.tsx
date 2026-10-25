import { useState } from 'react';
import { BOARD, GROUP_COLORS } from '../../shared/board';
import { groupHasUpgrades, ownedBy } from '../../shared/rules';
import type { TradeOffer, TradeSide } from '../../shared/types';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { ConfirmButton, Countdown, Modal } from './common';
import { asState } from './Center';

function SideSummary({ side }: { side: TradeSide }) {
  const { t, money } = useT();
  const parts: string[] = [];
  if (side.cash) parts.push(money(side.cash));
  for (const i of side.properties) parts.push(t(`spaces.${BOARD[i].key}`));
  if (side.jailCards) parts.push(`${side.jailCards}× ${t('trade.jailCards')}`);
  return <span>{parts.length ? parts.join(', ') : t('common.none')}</span>;
}

export function TradeCard({ view, trade, onCounter }: { view: GameView; trade: TradeOffer; onCounter?: () => void }) {
  const { t } = useT();
  const incoming = trade.toId === view.you;
  const other = view.players.find((p) => p.id === (incoming ? trade.fromId : trade.toId));
  // From the viewer's perspective:
  const youGive = incoming ? trade.get : trade.give;
  const youGet = incoming ? trade.give : trade.get;
  return (
    <div className={`trade-card ${trade.status}`} data-testid="trade-card">
      <header>
        <strong>{incoming ? t('trade.incoming', { name: other?.name ?? '?' }) : t('trade.outgoing', { name: other?.name ?? '?' })}</strong>
        {trade.status === 'pending' ? <Countdown until={trade.expiresAt} /> : <span className="badge">{t(`trade.status.${trade.status}`)}</span>}
      </header>
      <p><b>{t('trade.youGive')}:</b> <SideSummary side={youGive} /></p>
      <p><b>{t('trade.youGet')}:</b> <SideSummary side={youGet} /></p>
      {trade.status === 'pending' && incoming && (
        <div className="btn-row">
          <ConfirmButton className="primary small" confirmText={t('trade.confirm')} onConfirm={() => store.act({ type: 'tradeRespond', tradeId: trade.id, accept: true })}>
            {t('trade.accept')}
          </ConfirmButton>
          <button className="ghost small" onClick={() => store.act({ type: 'tradeRespond', tradeId: trade.id, accept: false })}>{t('trade.reject')}</button>
          {onCounter && <button className="secondary small" onClick={onCounter}>{t('trade.counter')}</button>}
        </div>
      )}
      {trade.status === 'pending' && !incoming && (
        <button className="ghost small" onClick={() => store.act({ type: 'tradeCancel', tradeId: trade.id })}>{t('trade.cancel')}</button>
      )}
    </div>
  );
}

function PropPicker({ view, ownerId, selected, toggle }: { view: GameView; ownerId: string; selected: number[]; toggle: (i: number) => void }) {
  const { t } = useT();
  const s = asState(view);
  const props = ownedBy(s, ownerId);
  if (!props.length) return <p className="muted small">{t('common.none')}</p>;
  return (
    <div className="prop-picker">
      {props.map((i) => {
        const d = BOARD[i];
        const blocked = groupHasUpgrades(s, i);
        return (
          <label key={i} className={`pp ${blocked ? 'blocked' : ''}`} title={blocked ? t('trade.noUpgradedHint') : ''}>
            <input type="checkbox" disabled={blocked} checked={selected.includes(i)} onChange={() => toggle(i)} />
            <span className="sw" style={{ background: d.group ? GROUP_COLORS[d.group] : '#5c6b7a' }} />
            {t(`spaces.${d.key}`)}
            {view.properties[i].mortgaged && <em className="neg"> ({t('prop.mortgaged')})</em>}
          </label>
        );
      })}
    </div>
  );
}

export function TradeModal({ view, initialTo, counterOf, onClose }: { view: GameView; initialTo?: string; counterOf?: string; onClose: () => void }) {
  const { t, money } = useT();
  const me = view.players.find((p) => p.id === view.you)!;
  const others = view.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const orig = counterOf ? view.trades.find((x) => x.id === counterOf) : undefined;
  const [to, setTo] = useState(initialTo ?? others[0]?.id ?? '');
  // Counteroffer starts from the original, mirrored to our perspective.
  const [give, setGive] = useState<TradeSide>(orig ? { ...orig.get, properties: [...orig.get.properties] } : { cash: 0, properties: [], jailCards: 0 });
  const [get, setGet] = useState<TradeSide>(orig ? { ...orig.give, properties: [...orig.give.properties] } : { cash: 0, properties: [], jailCards: 0 });
  const other = view.players.find((p) => p.id === to);
  const toggle = (side: 'give' | 'get', i: number) => {
    const set = side === 'give' ? setGive : setGet;
    set((x) => ({ ...x, properties: x.properties.includes(i) ? x.properties.filter((y) => y !== i) : [...x.properties, i] }));
  };
  const send = async () => {
    const ok = await store.act({ type: 'tradeOffer', toId: to, give, get, counterOf });
    if (ok) onClose();
  };
  if (!other) return null;
  return (
    <Modal title={counterOf ? t('trade.counter') : t('trade.title')} onClose={onClose} wide>
      <label className="field inline">
        <span>{t('trade.with')}</span>
        <select value={to} disabled={!!counterOf} onChange={(e) => { setTo(e.target.value); setGet({ cash: 0, properties: [], jailCards: 0 }); }}>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="trade-grid">
        <section>
          <h4>{t('trade.youGive')}</h4>
          <label className="field inline"><span>{t('trade.cash')} (≤ {money(me.cash)})</span>
            <input type="number" min={0} max={me.cash} step={10} value={give.cash} onChange={(e) => setGive({ ...give, cash: Math.max(0, Math.min(me.cash, Math.floor(Number(e.target.value) || 0))) })} />
          </label>
          {me.jailCards > 0 && <label className="field inline"><span>{t('trade.jailCards')}</span>
            <input type="number" min={0} max={me.jailCards} value={give.jailCards} onChange={(e) => setGive({ ...give, jailCards: Math.max(0, Math.min(me.jailCards, Math.floor(Number(e.target.value) || 0))) })} />
          </label>}
          <PropPicker view={view} ownerId={me.id} selected={give.properties} toggle={(i) => toggle('give', i)} />
        </section>
        <section>
          <h4>{t('trade.youGet')}</h4>
          <label className="field inline"><span>{t('trade.cash')} (≤ {money(other.cash)})</span>
            <input type="number" min={0} max={other.cash} step={10} value={get.cash} onChange={(e) => setGet({ ...get, cash: Math.max(0, Math.min(other.cash, Math.floor(Number(e.target.value) || 0))) })} />
          </label>
          {other.jailCards > 0 && <label className="field inline"><span>{t('trade.jailCards')}</span>
            <input type="number" min={0} max={other.jailCards} value={get.jailCards} onChange={(e) => setGet({ ...get, jailCards: Math.max(0, Math.min(other.jailCards, Math.floor(Number(e.target.value) || 0))) })} />
          </label>}
          <PropPicker view={view} ownerId={other.id} selected={get.properties} toggle={(i) => toggle('get', i)} />
        </section>
      </div>
      <p className="muted small">{t('trade.noUpgradedHint')}</p>
      <div className="btn-row end">
        <button className="ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="primary" onClick={send} data-testid="send-trade">{t('trade.send')}</button>
      </div>
    </Modal>
  );
}
