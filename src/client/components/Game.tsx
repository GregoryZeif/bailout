import { useEffect, useState } from 'react';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { Board } from './Board';
import { Center } from './Center';
import { ConfirmButton, LangMute, Modal } from './common';
import { EndScreen } from './EndScreen';
import { HelpModal } from './HelpModal';
import { CardOverlay, QuizOverlay } from './Overlays';
import { PortfolioModal, PropertyModal } from './PropertyModal';
import { PlayersPanel, SidePanel, type SideTab } from './SidePanel';
import { TesterModal } from './Tester';
import { TradeModal } from './TradeModal';

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function Game({ view }: { view: GameView }) {
  const { t, money } = useT();
  const wide = useMedia('(min-width: 1180px)');
  const [selected, setSelected] = useState<number | null>(null);
  const [portfolio, setPortfolio] = useState(false);
  const [trade, setTrade] = useState<{ to?: string; counterOf?: string } | null>(null);
  const [tab, setTab] = useState<SideTab>('log');
  const [mobileTab, setMobileTab] = useState<'players' | SideTab>('players');
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [tester, setTester] = useState(false);
  const [bankruptSeen, setBankruptSeen] = useState(false);
  const me = view.players.find((p) => p.id === view.you);
  const myDebt = view.debts.filter((d) => d.debtorId === view.you).reduce((n, d) => n + d.amount, 0);
  const openTrade = (to?: string, counterOf?: string) => setTrade({ to, counterOf });

  const side = <SidePanel view={view} tab={tab} setTab={setTab} onTrade={openTrade} />;
  const players = <PlayersPanel view={view} onTrade={(id) => openTrade(id)} onSelectSpace={setSelected} />;

  return (
    <div className={`game-screen ${wide ? 'wide' : 'narrow'}`}>
      <header className="game-top">
        <div className="brand-mini">{t('app.title')} <small>{t('app.subtitle')}</small></div>
        {me && !me.bankrupt && (
          <div className="me-summary" style={{ borderColor: me.color }}>
            <span>{t('hud.cash')} <strong data-testid="my-cash">{money(me.cash)}</strong></span>
            {me.loan > 0 && <span className="neg">{t('hud.loan')} {money(me.loan)}</span>}
            {myDebt > 0 && <span className="neg blink">{t('hud.debt')} {money(myDebt)}</span>}
            <button className="secondary small" onClick={() => setPortfolio(true)} data-testid="portfolio">{t('hud.portfolio')}</button>
          </div>
        )}
        <div className="top-right">
          {view.testMode && <button className="tester-btn small" onClick={() => setTester(true)} data-testid="tester-tools">🧪 {t('tester.short')}</button>}
          <LangMute />
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t('hud.menu')}>☰</button>
        </div>
      </header>

      <main className="game-main">
        {wide && <div className="col-left">{players}</div>}
        <div className="col-board">
          <Board view={view} onSelect={setSelected}>
            <Center view={view} onOpenPortfolio={() => setPortfolio(true)} />
          </Board>
        </div>
        {wide ? (
          <div className="col-right">{side}</div>
        ) : (
          <div className="col-mobile">
            <nav className="tabs" role="tablist">
              {(['players', 'chat', 'log', 'money', 'trades'] as const).map((k) => (
                <button key={k} role="tab" aria-selected={mobileTab === k} className={mobileTab === k ? 'on' : ''} onClick={() => setMobileTab(k)}>
                  {t(`tab.${k}`)}
                  {k === 'trades' && view.trades.some((x) => x.status === 'pending' && x.toId === view.you) && <span className="dot">!</span>}
                </button>
              ))}
            </nav>
            <div className="tab-body">
              {mobileTab === 'players' ? players : <SidePanel view={view} tab={mobileTab} setTab={setMobileTab} onTrade={openTrade} />}
            </div>
          </div>
        )}
      </main>

      {selected !== null && <PropertyModal view={view} space={selected} onClose={() => setSelected(null)} />}
      {portfolio && me && !me.bankrupt && <PortfolioModal view={view} onClose={() => setPortfolio(false)} onSelect={(i) => setSelected(i)} />}
      {trade && me && !me.bankrupt && <TradeModal view={view} initialTo={trade.to} counterOf={trade.counterOf} onClose={() => setTrade(null)} />}
      {view.status === 'playing' && <CardOverlay view={view} />}
      {view.status === 'playing' && <QuizOverlay view={view} />}
      {view.status === 'finished' && <EndScreen view={view} />}
      {view.status === 'playing' && me?.bankrupt && !bankruptSeen && (
        <Modal title={t('bankrupt.title')} className="bankrupt-modal">
          <div className="bankrupt-art" aria-hidden>
            <svg viewBox="0 0 120 70"><path d="M10 60h100" stroke="currentColor" strokeWidth="3" /><path d="M20 20h80v40H20z" fill="none" stroke="#c0392b" strokeWidth="4" /><path d="M35 30l50 20M85 30L35 50" stroke="#c0392b" strokeWidth="4" /></svg>
          </div>
          <p>{t('bankrupt.body')}</p>
          <div className="btn-row">
            <button className="primary" onClick={() => setBankruptSeen(true)}>{t('bankrupt.spectate')}</button>
            <button className="ghost" onClick={() => store.exitToMenu()}>{t('end.backToMenu')}</button>
          </div>
        </Modal>
      )}
      {menu && (
        <Modal title={t('hud.menu')} onClose={() => setMenu(false)}>
          <div className="btn-col">
            <button className="secondary" onClick={() => { setMenu(false); setHelp(true); }}>{t('menu.howToPlay')}</button>
            <p className="muted small">{t('lobby.code')}: <strong>{view.code}</strong></p>
            {me && !me.bankrupt && view.status === 'playing' ? (
              <ConfirmButton className="danger" confirmText={t('log.forfeit', { p: me.name })} onConfirm={() => { setMenu(false); void store.leave(); }}>
                {t('common.leave')}
              </ConfirmButton>
            ) : (
              <button className="secondary" onClick={() => store.exitToMenu()}>{t('end.backToMenu')}</button>
            )}
          </div>
        </Modal>
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {tester && <TesterModal view={view} onClose={() => setTester(false)} />}
    </div>
  );
}
