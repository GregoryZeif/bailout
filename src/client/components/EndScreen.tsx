import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { Modal } from './common';
import { TokenIcon } from './icons';

export function EndScreen({ view }: { view: GameView }) {
  const { t, money } = useT();
  const winner = view.players.find((p) => p.id === view.winnerId);
  const timed = view.log.some((l) => l.key === 'log.timeUp');
  return (
    <Modal title={t('end.title')} wide className="end-modal">
      <div className="end-hero">
        {winner && <span className="tok big" style={{ background: winner.color }}><TokenIcon token={winner.token} size={44} color="#f4ecd8" /></span>}
        <h3>{winner ? t(timed ? 'end.winnerTimed' : 'end.winner', { name: winner.name }) : t('end.noWinner')}</h3>
      </div>
      <div className="table-scroll">
        <table className="leaderboard" data-testid="leaderboard">
          <thead>
            <tr>
              <th>{t('end.rank')}</th><th>{t('end.player')}</th><th>{t('end.cash')}</th><th>{t('end.property')}</th>
              <th>{t('end.upgrades')}</th><th>{t('end.mortgages')}</th><th>{t('end.loan')}</th><th>{t('end.total')}</th>
            </tr>
          </thead>
          <tbody>
            {(view.finalWealth ?? []).map((w, i) => {
              const p = view.players.find((x) => x.id === w.playerId)!;
              return (
                <tr key={w.playerId} className={w.playerId === view.winnerId ? 'win' : p.bankrupt ? 'out' : ''}>
                  <td>{i + 1}</td>
                  <td><span className="dot" style={{ background: p.color }} /> {p.name}{p.bankrupt && <small> · {t('end.bankruptAt', { n: p.bankruptRound ?? 0 })}</small>}</td>
                  <td>{money(w.cash)}</td>
                  <td>{money(w.propertyValue)}</td>
                  <td>{money(w.upgradeValue)}</td>
                  <td className="neg">−{money(w.mortgageDebt)}</td>
                  <td className="neg">−{money(w.loan)}</td>
                  <td><strong>{money(w.total)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="primary" onClick={() => store.exitToMenu()}>{t('end.backToMenu')}</button>
    </Modal>
  );
}
