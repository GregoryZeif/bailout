import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BOARD, GROUP_COLORS } from '../../shared/board';
import { currentPrice } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import type { GameView } from '../../shared/view';
import { store } from '../store';
import { useT } from '../i18n';
import { BibiSketch } from './BibiSketch';
import { SpaceIcon, TokenIcon } from './icons';

/** Grid coordinates (1-based row, col) on an 11×11 grid, Start at bottom-right. */
export function cell(i: number): { row: number; col: number; side: 'bottom' | 'left' | 'top' | 'right'; corner: boolean } {
  if (i <= 10) return { row: 11, col: 11 - i, side: 'bottom', corner: i % 10 === 0 };
  if (i <= 20) return { row: 11 - (i - 10), col: 1, side: 'left', corner: i === 20 };
  if (i <= 30) return { row: 1, col: 1 + (i - 20), side: 'top', corner: i === 30 };
  return { row: 1 + (i - 30), col: 11, side: 'right', corner: false };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function usePositions(view: GameView) {
  const [disp, setDisp] = useState<Record<string, number>>(() => Object.fromEntries(view.players.map((p) => [p.id, p.position])));
  const pending = useRef<Record<string, number>>({});
  const chains = useRef<Record<string, Promise<void>>>({});

  useEffect(() => store.onEvents((events) => {
    for (const e of events) {
      if (e.type !== 'move') continue;
      const id = e.playerId;
      pending.current[id] = (pending.current[id] ?? 0) + 1;
      const run = async () => {
        if (e.direct || reducedMotion()) {
          setDisp((d) => ({ ...d, [id]: e.to }));
          await new Promise((r) => setTimeout(r, 150));
        } else {
          const steps = (e.to - e.from + 40) % 40;
          const dir = steps > 20 ? -1 : 1; // backwards moves (e.g. "move back 3")
          const n = dir === 1 ? steps : 40 - steps;
          for (let k = 1; k <= n; k++) {
            const pos = (e.from + dir * k + 40) % 40;
            setDisp((d) => ({ ...d, [id]: pos }));
            await new Promise((r) => setTimeout(r, 110));
          }
        }
        pending.current[id]--;
      };
      chains.current[id] = (chains.current[id] ?? Promise.resolve()).then(run);
    }
  }), []);

  // Snap anyone not mid-animation (refresh, reconnect, bankruptcies).
  useEffect(() => {
    setDisp((d) => {
      let changed = false;
      const next = { ...d };
      for (const p of view.players) {
        if ((pending.current[p.id] ?? 0) > 0) continue;
        if (next[p.id] !== p.position) {
          next[p.id] = p.position;
          changed = true;
        }
      }
      return changed ? next : d;
    });
  }, [view]);
  return disp;
}

export function Board({ view, onSelect, children }: { view: GameView; onSelect: (i: number) => void; children: ReactNode }) {
  const { t, money } = useT();
  const disp = usePositions(view);
  const cur = view.players[view.current];
  const s = view as unknown as GameState;
  return (
    <div className="board" role="grid" aria-label="Game board">
      {BOARD.map((d) => {
        const c = cell(d.index);
        const o = view.properties[d.index];
        const owner = o ? view.players.find((p) => p.id === o.ownerId) : undefined;
        const here = view.players.filter((p) => !p.bankrupt && disp[p.id] === d.index);
        const isCur = cur && disp[cur.id] === d.index && view.status === 'playing';
        return (
          <button
            key={d.index}
            className={`tile side-${c.side} kind-${d.kind}${c.corner ? ' corner' : ''}${owner ? ' owned' : ''}${o?.mortgaged ? ' mortgaged' : ''}${isCur ? ' current' : ''}`}
            style={{ gridRow: c.row, gridColumn: c.col, ...(owner ? { '--owner': owner.color } : {}) } as CSSProperties}
            onClick={() => onSelect(d.index)}
            aria-label={t(`spaces.${d.key}`)}
            title={t(`spaces.${d.key}`)}
            data-space={d.index}
          >
            {d.group && <span className="band" style={{ background: GROUP_COLORS[d.group] }} />}
            {owner && <span className="owner-mark" style={{ background: owner.color }} title={owner.name} />}
            <span className="tile-body">
              {d.kind !== 'property' && <span className="tile-icon"><SpaceIcon kind={d.kind} size={c.corner ? 30 : 18} /></span>}
              <span className="tile-name">{t(`spaces.${d.key}`)}</span>
              {d.price !== undefined && !o && <span className="tile-price">{money(currentPrice(s, d.index))}</span>}
              {o && o.upgrades > 0 && (
                <span className="tile-ups" aria-label={`${o.upgrades}`}>
                  {o.upgrades === 5 ? <span className="compound">★</span> : Array.from({ length: o.upgrades }, (_, k) => <span key={k} className="reno" />)}
                </span>
              )}
            </span>
            {here.length > 0 && (
              <span className={`tile-tokens n${Math.min(here.length, 6)}`}>
                {here.map((p) => (
                  <span key={p.id} className={`pawn${p.id === cur?.id ? ' active' : ''}${p.inJail ? ' jailed' : ''}`} style={{ background: p.color }} title={p.name}>
                    <TokenIcon token={p.token} size={14} color="#f4ecd8" />
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
      <div className="board-center"><BibiSketch className="board-bibi" decorative />{children}</div>
    </div>
  );
}
