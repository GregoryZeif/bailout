import { useEffect, useState } from 'react';
import type { TokenId } from '../../shared/types';
import type { PublicRoom } from '../../shared/view';
import { store, useStore } from '../store';
import { useT } from '../i18n';
import { BibiSketch } from './BibiSketch';
import { LangMute } from './common';
import { HelpModal } from './HelpModal';
import { LibraryModal } from './Tester';
import { TokenIcon } from './icons';

const HEADLINES = ['menu.news1', 'menu.news2', 'menu.news3', 'menu.news4', 'menu.news5'];
const FEATURES: { token: TokenId; color: string; title: string; text: string }[] = [
  { token: 'piggy', color: '#c0392b', title: 'menu.f1Title', text: 'menu.f1Text' },
  { token: 'briefcase', color: '#24427a', title: 'menu.f2Title', text: 'menu.f2Text' },
  { token: 'coffee', color: '#d9853b', title: 'menu.f3Title', text: 'menu.f3Text' },
];

export function Menu() {
  const { t } = useT();
  const name = useStore((s) => s.name);
  const rooms = useStore((s) => s.rooms);
  const connected = useStore((s) => s.connected);
  const tester = useStore((s) => s.tester);
  const [library, setLibrary] = useState(false);
  const [draft, setDraft] = useState(name);
  const [code, setCode] = useState('');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<PublicRoom[]>([]);

  // Refresh the public room list while the menu is visible.
  useEffect(() => {
    if (!connected) return;
    let live = true;
    const load = () => store.listRooms().then((r) => live && setOpen(r));
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [connected]);

  const ensureName = async () => {
    const n = draft.trim() || t('menu.namePlaceholder').replace(/^.*?, /, '');
    if (n !== name) await store.setName(n);
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureName();
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const off = !connected || busy;
  const news = HEADLINES.map((k) => t(k));

  return (
    <div className="menu-screen">
      <div className="ticker" aria-hidden>
        <span className="ticker-label">{t('menu.breaking')}</span>
        <div className="ticker-window">
          <div className="ticker-track">
            {[...news, ...news].map((n, i) => <span key={i}>{n}</span>)}
          </div>
        </div>
      </div>

      <header className="menu-top"><LangMute /></header>

      <main className="menu-hero">
        <figure className="poster">
          <div className="poster-paper">
            <span className="tape tape-l" aria-hidden />
            <span className="tape tape-r" aria-hidden />
            <BibiSketch className="bibi" />
            <figcaption>
              <strong>{t('menu.posterName')}</strong>
              <span>{t('menu.posterRole')}</span>
            </figcaption>
          </div>
        </figure>

        <section className="menu-card">
          <div className="brand">
            <h1>{t('app.title')}</h1>
            <div className="brand-sub">{t('app.subtitle')}</div>
            <p className="tagline">{t('app.tagline')}</p>
            <ul className="meta-chips">
              {t('menu.players').split(' · ').map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>

          <label className="field">
            <span>{t('menu.yourName')}</span>
            <input value={draft} maxLength={20} placeholder={t('menu.namePlaceholder')} onChange={(e) => setDraft(e.target.value)} />
          </label>

          {rooms.length > 0 && (
            <div className="resume">
              {rooms.map((r) => (
                <button key={r} className="secondary" disabled={off} onClick={() => run(() => store.join(r))}>
                  {t('menu.resume', { code: r })}
                </button>
              ))}
            </div>
          )}

          <div className="play-options">
            <button className="play-tile hot" disabled={off} onClick={() => run(() => store.playWithBots())} data-testid="play-bots">
              <span className="play-icon" aria-hidden><TokenIcon token="drone" size={30} color="#f4ecd8" /></span>
              <span className="tile-text"><strong>{t('menu.playBots')}</strong><small>{t('menu.playBotsHint')}</small></span>
            </button>
            <button className="play-tile primary" disabled={off} onClick={() => run(() => store.createRoom('private'))}>
              <span className="tile-text"><strong>{t('menu.create')}</strong><small>{t('menu.createHint')}</small></span>
            </button>
            <button className="play-tile secondary" disabled={off} onClick={() => run(() => store.createRoom('public'))} data-testid="create-public">
              <span className="tile-text"><strong>{t('menu.createPublic')}</strong><small>{t('menu.createPublicHint')}</small></span>
            </button>
          </div>

          <form className="join-row" onSubmit={(e) => { e.preventDefault(); run(() => store.join(code)); }}>
            <input value={code} maxLength={5} placeholder={t('menu.codePlaceholder')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label={t('menu.codePlaceholder')} />
            <button className="secondary" disabled={off || code.length < 4}>{t('menu.join')}</button>
          </form>

          <section className="public-rooms" aria-labelledby="public-rooms-title">
            <h2 id="public-rooms-title"><span className="live-dot" aria-hidden />{t('menu.publicRooms')}</h2>
            {open.length === 0 ? <p className="hint">{t('menu.noPublicRooms')}</p> : (
              <ul>
                {open.map((r) => (
                  <li key={r.code}>
                    <span className="nm">{t('menu.roomOf', { name: r.hostName })}</span>
                    <span className="hint">{t('menu.roomSeats', { n: r.players, max: r.maxPlayers })}{r.bots > 0 && ` · ${t('menu.roomBots', { n: r.bots })}`}</span>
                    <button className="secondary small" disabled={off} onClick={() => run(() => store.join(r.code))}>{t('menu.join')}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tester && (
            <section className="tester-box" aria-label={t('tester.title')}>
              <h2>🧪 {t('tester.title')}</h2>
              <p className="hint">{t('tester.menuHint')}</p>
              <div className="btn-row">
                <button className="secondary small" disabled={off} onClick={() => run(() => store.startTestGame())} data-testid="tester-game">{t('tester.startGame')}</button>
                <button className="ghost small" disabled={!connected} onClick={() => setLibrary(true)}>{t('tester.openLibrary')}</button>
              </div>
            </section>
          )}

          <button className="link" onClick={() => setHelp(true)}>{t('menu.howToPlay')}</button>
          {!connected && <p className="status-line">{t('common.connecting')}</p>}
        </section>
      </main>

      <section className="features" aria-label={t('menu.howToPlay')}>
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <span className="feature-icon" style={{ background: f.color }}><TokenIcon token={f.token} size={28} color="#f4ecd8" /></span>
            <h3>{t(f.title)}</h3>
            <p>{t(f.text)}</p>
          </article>
        ))}
      </section>

      <footer className="footer-note">{t('menu.footer')}</footer>
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {library && <LibraryModal onClose={() => setLibrary(false)} />}
    </div>
  );
}
