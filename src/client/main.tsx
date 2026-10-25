import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { store, useStore } from './store';
import { useT } from './i18n';
import { Menu } from './components/Menu';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';
import { Toasts } from './components/common';
import './styles.css';

function App() {
  const view = useStore((s) => s.view);
  const code = useStore((s) => s.code);
  const connected = useStore((s) => s.connected);
  const everConnected = useStore((s) => s.everConnected);
  const lang = useStore((s) => s.lang);
  const { t } = useT();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t('app.title')}: ${t('app.subtitle')}`;
  }, [lang, t]);

  let screen;
  if (!code || !view) screen = <Menu />;
  else if (view.status === 'lobby') screen = <Lobby view={view} />;
  else screen = <Game view={view} />;

  return (
    <>
      {screen}
      {everConnected && !connected && <div className="offline-banner" role="status">{t('common.offline')}</div>}
      <Toasts />
    </>
  );
}

store.connect();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
