import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LANGS } from '../../shared/i18n';
import { store, useStore } from '../store';
import { useT } from '../i18n';

export function Modal({ title, onClose, children, wide, className }: { title: ReactNode; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const { t } = useT();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          {t(x.key, x.params)}
        </div>
      ))}
    </div>
  );
}

export function LangMute() {
  const lang = useStore((s) => s.lang);
  const muted = useStore((s) => s.muted);
  const { t } = useT();
  return (
    <div className="lang-mute">
      <div className="seg" role="group" aria-label={t('common.language')}>
        {LANGS.map((l) => (
          <button key={l} className={l === lang ? 'on' : ''} onClick={() => store.setLang(l)} aria-pressed={l === lang}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="icon-btn" onClick={() => store.setMuted(!muted)} aria-label={muted ? t('hud.unmute') : t('hud.mute')} title={muted ? t('hud.unmute') : t('hud.mute')}>
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
        )}
      </button>
    </div>
  );
}

/** Re-renders every `ms` so countdowns stay live. */
export function useNow(ms = 500): number {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return store.serverNow();
}

export function Countdown({ until, total }: { until: number; total?: number }) {
  const now = useNow(250);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const pct = total ? Math.max(0, Math.min(100, ((until - now) / (total * 1000)) * 100)) : null;
  return (
    <span className={`countdown ${left <= 10 ? 'urgent' : ''}`} aria-label={`${left}s`}>
      {pct !== null && <span className="countdown-bar" style={{ width: `${pct}%` }} />}
      <span className="countdown-text">{left >= 100 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left}s`}</span>
    </span>
  );
}

export function ConfirmButton({ onConfirm, children, confirmText, className }: { onConfirm: () => void; children: ReactNode; confirmText: string; className?: string }) {
  const [asking, setAsking] = useState(false);
  const { t } = useT();
  if (!asking) return <button className={className} onClick={() => setAsking(true)}>{children}</button>;
  return (
    <div className="confirm-inline">
      <span>{confirmText}</span>
      <button className="danger" onClick={() => { setAsking(false); onConfirm(); }}>{t('common.confirm')}</button>
      <button className="ghost" onClick={() => setAsking(false)}>{t('common.cancel')}</button>
    </div>
  );
}
