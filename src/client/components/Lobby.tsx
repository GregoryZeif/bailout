import { useState } from 'react';
import { CONFIG_BOUNDS, TOKENS } from '../../shared/board';
import type { GameConfig } from '../../shared/types';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT, type T } from '../i18n';
import { LangMute } from './common';
import { ChatBox } from './SidePanel';
import { TokenIcon } from './icons';

interface Preset {
  value: number;
  name: string;
  /** Detail line under the name, e.g. "20 min". */
  detail: (t: T) => string;
}

/** The few settings most hosts care about, as one-tap choices. */
const SIMPLE: { key: keyof GameConfig; label: string; presets: Preset[] }[] = [
  {
    key: 'timeLimitMinutes', label: 'lobby.gameLength', presets: [
      { value: 20, name: 'preset.quick', detail: ({ t }) => t('preset.minutes', { n: 20 }) },
      { value: 45, name: 'preset.standard', detail: ({ t }) => t('preset.minutes', { n: 45 }) },
      { value: 90, name: 'preset.long', detail: ({ t }) => t('preset.minutes', { n: 90 }) },
      { value: 0, name: 'preset.endless', detail: ({ t }) => t('preset.lastStanding') },
    ],
  },
  {
    key: 'turnSeconds', label: 'lobby.turnSpeed', presets: [
      { value: 45, name: 'preset.fast', detail: ({ t }) => t('preset.seconds', { n: 45 }) },
      { value: 90, name: 'preset.normal', detail: ({ t }) => t('preset.seconds', { n: 90 }) },
      { value: 180, name: 'preset.relaxed', detail: ({ t }) => t('preset.minutes', { n: 3 }) },
    ],
  },
  {
    key: 'startingCash', label: 'lobby.startingCash', presets: [
      { value: 1000, name: 'preset.tight', detail: ({ money }) => money(1000) },
      { value: 1500, name: 'preset.normal', detail: ({ money }) => money(1500) },
      { value: 3000, name: 'preset.generous', detail: ({ money }) => money(3000) },
    ],
  },
];

/** Everything else, behind "Advanced settings". */
const ADVANCED: (keyof GameConfig)[] = [
  'timeLimitMinutes', 'turnSeconds', 'startingCash', 'maxPlayers', 'auctionSeconds', 'tradeSeconds',
  'inflationChance', 'salary', 'reconnectGraceSeconds', 'abandonSeconds',
];

export function Lobby({ view }: { view: GameView }) {
  const { t } = useT();
  const me = view.players.find((p) => p.id === view.you)!;
  const isHost = view.hostId === view.you;
  const isPublic = view.visibility === 'public';
  const [copied, setCopied] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const canStart = view.players.length >= 2 && view.players.every((p) => p.id === view.hostId || p.ready);

  const copy = async () => {
    const url = `${location.origin}${location.pathname}#${view.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is visible anyway */
    }
  };

  return (
    <div className="lobby-screen">
      <header className="lobby-head">
        <div>
          <h1>{t('app.title')} <small>{t('app.subtitle')}</small></h1>
        </div>
        <LangMute />
      </header>
      <div className="lobby-grid">
        <section className="panel">
          <div className="room-code">
            <span>{t('lobby.code')}</span>
            <strong data-testid="room-code">{view.code}</strong>
            <button className="secondary small" onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button>
          </div>
          <div className="visibility">
            <span className={`badge ${isPublic ? 'ok' : ''}`}>{t(isPublic ? 'lobby.public' : 'lobby.private')}</span>
            <span className="hint">{t(isPublic ? 'lobby.publicHint' : 'lobby.privateHint')}</span>
            {isHost && (
              <button className="ghost small" onClick={() => store.act({ type: 'setVisibility', visibility: isPublic ? 'private' : 'public' })} data-testid="toggle-visibility">
                {t(isPublic ? 'lobby.makePrivate' : 'lobby.makePublic')}
              </button>
            )}
          </div>
          <h3>{t('lobby.players', { n: view.players.length, max: view.config.maxPlayers })}</h3>
          <ul className="lobby-players">
            {view.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span className="tok" style={{ background: p.color }}><TokenIcon token={p.token} size={22} color="#f4ecd8" /></span>
                <span className="nm">{p.name}{p.id === view.you && <em> ({t('common.you')})</em>}</span>
                {p.bot && <span className="badge">{t('lobby.bot')}</span>}
                {p.id === view.hostId ? <span className="badge host">{t('lobby.host')}</span>
                  : <span className={`badge ${p.ready ? 'ok' : ''}`}>{p.ready ? t('lobby.ready') : t('lobby.notReady')}</span>}
                {p.bot && isHost && (
                  <button className="ghost small icon-btn" onClick={() => store.act({ type: 'removeBot', playerId: p.id })}
                    title={t('lobby.removeBot')} aria-label={t('lobby.removeBot')}>×</button>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <button className="secondary small add-bot" disabled={view.players.length >= view.config.maxPlayers}
              onClick={() => store.act({ type: 'addBot' })} data-testid="add-bot">
              {t('lobby.addBot')}
            </button>
          )}
          <h3>{t('lobby.token')}</h3>
          <div className="token-picker">
            {TOKENS.map((tk) => {
              const taken = view.players.some((p) => p.token === tk && p.id !== me.id);
              return (
                <button key={tk} className={`token-opt ${me.token === tk ? 'on' : ''}`} disabled={taken} onClick={() => store.act({ type: 'setToken', token: tk })} title={t(`token.${tk}`)} aria-label={t(`token.${tk}`)}>
                  <TokenIcon token={tk} size={30} color={me.token === tk ? me.color : '#14213d'} />
                  <small>{t(`token.${tk}`)}</small>
                </button>
              );
            })}
          </div>
          <div className="lobby-actions">
            {isHost ? (
              <button className="primary big" disabled={!canStart} onClick={() => store.act({ type: 'start' })} data-testid="start">
                {t('lobby.start')}
              </button>
            ) : (
              <button className={me.ready ? 'secondary big' : 'primary big'} onClick={() => store.act({ type: 'setReady', ready: !me.ready })} data-testid="ready">
                {me.ready ? t('lobby.unready') : t('lobby.imReady')}
              </button>
            )}
            <p className="hint">{isHost ? (!canStart ? t('lobby.needPlayers') : '') : t('lobby.waitHost')}</p>
            <button className="ghost" onClick={() => store.leave()}>{t('lobby.leave')}</button>
          </div>
        </section>

        <section className="panel">
          <h3>{t('lobby.settings')}</h3>
          <div className="simple-settings">
            {SIMPLE.map((g) => (
              <PresetGroup key={g.key} group={g} value={view.config[g.key]} editable={isHost} />
            ))}
          </div>
          <button className="link advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} data-testid="advanced">
            {t(advanced ? 'lobby.hideAdvanced' : 'lobby.advanced')} {advanced ? '▴' : '▾'}
          </button>
          {advanced && (
            <div className="settings">
              {ADVANCED.map((k) => (
                <ConfigRow key={k} k={k} value={view.config[k]} editable={isHost} />
              ))}
            </div>
          )}
        </section>

        <section className="panel chat-panel">
          <h3>{t('tab.chat')}</h3>
          <ChatBox view={view} />
        </section>
      </div>
    </div>
  );
}

function PresetGroup({ group, value, editable }: { group: (typeof SIMPLE)[number]; value: number; editable: boolean }) {
  const tt = useT();
  const { t } = tt;
  const custom = !group.presets.some((p) => p.value === value);
  return (
    <div className="preset-group" role="group" aria-label={t(group.label)}>
      <span className="preset-label">{t(group.label)}</span>
      <div className="preset-chips">
        {group.presets.map((p) => (
          <button key={p.value} className={`preset-chip${p.value === value ? ' on' : ''}`} aria-pressed={p.value === value}
            disabled={!editable && p.value !== value}
            onClick={() => editable && p.value !== value && store.act({ type: 'configure', config: { [group.key]: p.value } })}>
            <strong>{t(p.name)}</strong>
            <small>{p.detail(tt)}</small>
          </button>
        ))}
        {custom && (
          <span className="preset-chip on custom">
            <strong>{t('preset.custom')}</strong>
            <small>{group.key === 'startingCash' ? tt.money(value) : tt.num(value)}</small>
          </span>
        )}
      </div>
    </div>
  );
}

function ConfigRow({ k, value, editable }: { k: keyof GameConfig; value: number; editable: boolean }) {
  const { t, num } = useT();
  const [lo, hi] = CONFIG_BOUNDS[k];
  const isPct = k === 'inflationChance';
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (isPct ? String(Math.round(value * 100)) : String(value));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    const v = isPct ? n / 100 : n;
    if (v === value) return;
    void store.act({ type: 'configure', config: { [k]: Math.min(hi, Math.max(lo, v)) } });
  };
  return (
    <label className="cfg-row">
      <span>{t(`cfg.${k}`)}</span>
      {editable ? (
        <span className="cfg-input">
          <input type="number" value={shown} min={isPct ? lo * 100 : lo} max={isPct ? hi * 100 : hi}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
          {isPct && '%'}
        </span>
      ) : (
        <strong>{isPct ? `${Math.round(value * 100)}%` : num(value)}</strong>
      )}
    </label>
  );
}
