import { useState } from 'react';
import { store, useStore } from '../store';
import { useT } from '../i18n';
import { LangMute } from './common';
import { HelpModal } from './HelpModal';
import { TokenIcon } from './icons';

export function Menu() {
  const { t } = useT();
  const name = useStore((s) => s.name);
  const rooms = useStore((s) => s.rooms);
  const connected = useStore((s) => s.connected);
  const [draft, setDraft] = useState(name);
  const [code, setCode] = useState('');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="menu-screen">
      <div className="menu-top"><LangMute /></div>
      <main className="menu-card">
        <div className="brand">
          <div className="brand-tokens" aria-hidden>
            {(['piggy', 'avocado', 'drone', 'coffee'] as const).map((tk, i) => (
              <span key={tk} style={{ animationDelay: `${i * 0.15}s` }}><TokenIcon token={tk} size={34} color={['#c0392b', '#5b7f62', '#24427a', '#d9853b'][i]} /></span>
            ))}
          </div>
          <h1>{t('app.title')}</h1>
          <div className="brand-sub">{t('app.subtitle')}</div>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="meta">{t('menu.players')}</p>
        </div>

        <label className="field">
          <span>{t('menu.yourName')}</span>
          <input value={draft} maxLength={20} placeholder={t('menu.namePlaceholder')} onChange={(e) => setDraft(e.target.value)} />
        </label>

        {rooms.length > 0 && (
          <div className="resume">
            {rooms.map((r) => (
              <button key={r} className="secondary" disabled={!connected || busy} onClick={() => run(() => store.join(r))}>
                {t('menu.resume', { code: r })}
              </button>
            ))}
          </div>
        )}

        <button className="primary big" disabled={!connected || busy} onClick={() => run(() => store.createRoom())}>
          {t('menu.create')}
        </button>

        <form className="join-row" onSubmit={(e) => { e.preventDefault(); run(() => store.join(code)); }}>
          <input value={code} maxLength={5} placeholder={t('menu.codePlaceholder')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label={t('menu.codePlaceholder')} />
          <button className="secondary" disabled={!connected || busy || code.length < 4}>{t('menu.join')}</button>
        </form>

        <button className="link" onClick={() => setHelp(true)}>{t('menu.howToPlay')}</button>
        {!connected && <p className="status-line">{t('common.connecting')}</p>}
        <p className="footer-note">{t('menu.footer')}</p>
      </main>
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}
