import { useState } from 'react';
import { BOARD, GROUP_COLORS, RULES } from '../../shared/board';
import {
  availableCredit, baseRent, currentPrice, luxuryTax, mortgageBlocker, mortgageValue, ownedBy, propertyTax, rentFor, scaled,
  sellUpgradeBlocker, unmortgageCost, upgradeBlocker, upgradeCost, upgradeRefund, wealthOf,
} from '../../shared/rules';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { Modal } from './common';
import { SpaceIcon } from './icons';
import { asState } from './Center';

/** Asset buttons for one property (shared by detail modal and portfolio). */
export function AssetActions({ view, space }: { view: GameView; space: number }) {
  const { t } = useT();
  const s = asState(view);
  const o = view.properties[space];
  const me = view.players.find((p) => p.id === view.you);
  if (!o || !me || o.ownerId !== me.id || view.status !== 'playing') return null;
  const myTurn = view.players[view.current]?.id === me.id && (view.phase === 'preRoll' || view.phase === 'postRoll');
  const inDebt = view.debts.some((d) => d.debtorId === me.id);
  const def = BOARD[space];
  return (
    <div className="asset-actions">
      {def.kind === 'property' && !upgradeBlocker(s, me.id, space) && (
        <button className="primary small" disabled={!myTurn || inDebt || me.cash < upgradeCost(s, space)} onClick={() => store.act({ type: 'upgrade', space })} title={!myTurn ? t('err.notYourTurn') : ''}>
          {t('prop.upgrade', { amount: upgradeCost(s, space) })}
        </button>
      )}
      {!sellUpgradeBlocker(s, me.id, space) && (
        <button className="secondary small" onClick={() => store.act({ type: 'sellUpgrade', space })}>{t('prop.sellUpgrade', { amount: upgradeRefund(space) })}</button>
      )}
      {!mortgageBlocker(s, me.id, space) && (
        <button className="secondary small" onClick={() => store.act({ type: 'mortgage', space })}>{t('prop.mortgage', { amount: mortgageValue(space) })}</button>
      )}
      {o.mortgaged && (
        <button className="secondary small" disabled={inDebt || me.cash < unmortgageCost(space)} onClick={() => store.act({ type: 'unmortgage', space })}>{t('prop.unmortgage', { amount: unmortgageCost(space) })}</button>
      )}
    </div>
  );
}

export function PropertyModal({ view, space, onClose }: { view: GameView; space: number; onClose: () => void }) {
  const { t, money, num } = useT();
  const s = asState(view);
  const def = BOARD[space];
  const o = view.properties[space];
  const owner = o ? view.players.find((p) => p.id === o.ownerId) : undefined;
  const me = view.players.find((p) => p.id === view.you);
  const rm = view.economy.rentMult;
  const r = (x: number) => money(Math.round((x * rm) / 10) * 10);

  return (
    <Modal title={t(`spaces.${def.key}`)} onClose={onClose} className="prop-modal">
      {def.group && <div className="deed-band" style={{ background: GROUP_COLORS[def.group] }} />}
      {!def.group && <div className="deed-icon"><SpaceIcon kind={def.kind} size={44} /></div>}
      <p className="muted">{t(`kind.${def.kind}`, {
        salary: num(view.config.salary), loan: num(RULES.studentLoanPayment),
        base: num(scaled(s, RULES.propertyTaxBase)), perProp: num(scaled(s, RULES.propertyTaxPerProperty)), perUp: num(scaled(s, RULES.propertyTaxPerUpgrade)),
        amount: num(def.kind === 'bailout' ? view.economy.bailoutPot : scaled(s, RULES.emergencyTax)),
      })}</p>
      {def.defense && <p className="badge ok">{t('kind.defense')}</p>}
      {def.kind === 'propertyTax' && me && <p>{money(propertyTax(s, me.id).total)} ({t('common.you')})</p>}
      {def.price !== undefined && (
        <table className="deed">
          <tbody>
            <tr><th>{t('prop.owner')}</th><td>{owner ? <span style={{ color: owner.color, fontWeight: 700 }}>{owner.name}</span> : t('prop.unowned')}</td></tr>
            <tr><th>{t('prop.price')}</th><td>{money(currentPrice(s, space))}{luxuryTax(s, space) > 0 && <> + {money(luxuryTax(s, space))} {t('prop.luxuryTax')}</>}</td></tr>
            {def.kind === 'property' && (
              <>
                <tr><th>{t('prop.rentBase')}</th><td>{r(baseRent(space))}</td></tr>
                <tr><th>{t('prop.rentGroup')}</th><td>{r(baseRent(space) * RULES.groupBonusMult)}</td></tr>
                {[1, 2, 3, 4].map((n) => (
                  <tr key={n} className={o?.upgrades === n ? 'hl' : ''}><th>{t('prop.rentLevel', { n })}</th><td>{r(baseRent(space) * RULES.upgradeRentMult[n])}</td></tr>
                ))}
                <tr className={o?.upgrades === 5 ? 'hl' : ''}><th>{t('prop.rentCompound')}</th><td>{r(baseRent(space) * RULES.upgradeRentMult[5])}</td></tr>
                <tr><th>{t('prop.upgradeCost')}</th><td>{money(upgradeCost(s, space))}</td></tr>
              </>
            )}
            {def.kind === 'infra' && [1, 2, 3, 4].map((n) => (
              <tr key={n}><th>{t('prop.rentInfra', { n })}</th><td>{r(RULES.infraRent[n])}</td></tr>
            ))}
            {def.kind === 'utility' && [1, 2].map((n) => (
              <tr key={n}><th>{t('prop.rentUtility', { n, mult: num(RULES.utilityDiceMult[n]) })}</th><td /></tr>
            ))}
            <tr><th>{t('prop.mortgageValue')}</th><td>{money(mortgageValue(space))}</td></tr>
            {o && me && o.ownerId !== me.id && <tr className="hl"><th>{t('prop.currentRent')}</th><td>{money(rentFor(s, space, 7, me.id))}</td></tr>}
            {o?.mortgaged && <tr><th colSpan={2} className="neg">{t('prop.mortgaged')} · {t('prop.unmortgageCost')} {money(unmortgageCost(space))}</th></tr>}
          </tbody>
        </table>
      )}
      <AssetActions view={view} space={space} />
    </Modal>
  );
}

export function PortfolioModal({ view, onClose, onSelect }: { view: GameView; onClose: () => void; onSelect: (i: number) => void }) {
  const { t, money, num } = useT();
  const s = asState(view);
  const me = view.players.find((p) => p.id === view.you)!;
  const owned = ownedBy(s, me.id);
  const w = wealthOf(s, me);
  const credit = availableCredit(s, me);
  const [amount, setAmount] = useState(500);
  const inDebt = view.debts.some((d) => d.debtorId === me.id);
  return (
    <Modal title={t('pf.title')} onClose={onClose} wide>
      <div className="pf-grid">
        <section>
          <h4>{t('pf.loanTitle')}</h4>
          <p className="muted small">{t('pf.loanInfo', { rate: num(Math.round(view.economy.loanRate * 1000) / 10) })}</p>
          <p>{t('pf.balance', { amount: me.loan })} · {t('pf.limit', { amount: credit })}</p>
          <div className="btn-row">
            <input type="number" step={100} min={100} value={amount} onChange={(e) => setAmount(Math.max(100, Math.round(Number(e.target.value) / 100) * 100 || 100))} aria-label={t('pf.amount')} />
            <button className="primary small" disabled={amount > credit} onClick={() => store.act({ type: 'borrow', amount })} data-testid="borrow">{t('act.borrow')}</button>
            <button className="secondary small" disabled={inDebt || me.loan <= 0 || me.cash <= 0} onClick={() => store.act({ type: 'repay', amount: Math.min(amount, me.loan, me.cash) })}>{t('act.repay')}</button>
          </div>
          <h4>{t('pf.wealth')}</h4>
          <table className="deed">
            <tbody>
              <tr><th>{t('end.cash')}</th><td>{money(w.cash)}</td></tr>
              <tr><th>{t('end.property')}</th><td>{money(w.propertyValue)}</td></tr>
              <tr><th>{t('end.upgrades')}</th><td>{money(w.upgradeValue)}</td></tr>
              <tr><th>{t('end.mortgages')}</th><td className="neg">−{money(w.mortgageDebt)}</td></tr>
              <tr><th>{t('end.loan')}</th><td className="neg">−{money(w.loan)}</td></tr>
              <tr className="hl"><th>{t('end.total')}</th><td>{money(w.total)}</td></tr>
            </tbody>
          </table>
          <p className="muted small">{t('hud.jailCards', { n: me.jailCards })}</p>
        </section>
        <section>
          {owned.length === 0 && <p className="muted">{t('pf.empty')}</p>}
          <ul className="pf-list">
            {owned.map((i) => {
              const d = BOARD[i];
              const o = view.properties[i];
              return (
                <li key={i}>
                  <button className="pf-name" onClick={() => onSelect(i)}>
                    <span className="sw" style={{ background: d.group ? GROUP_COLORS[d.group] : '#5c6b7a' }} />
                    {t(`spaces.${d.key}`)}
                    {o.upgrades > 0 && <em> · {o.upgrades === 5 ? t('prop.compound') : t('prop.level', { n: o.upgrades })}</em>}
                    {o.mortgaged && <em className="neg"> · {t('prop.mortgaged')}</em>}
                  </button>
                  <AssetActions view={view} space={i} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
