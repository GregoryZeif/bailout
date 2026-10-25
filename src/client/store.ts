/**
 * Client store: socket connection, session token, latest server view.
 * The server is the source of truth; localStorage only remembers the
 * identity token, last room, language and mute preference (conveniences).
 */
import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action, GameEvent, Lang, Visibility } from '../shared/types';
import type { ClientToServer, GameView, PublicRoom, ServerToClient, TesterLibrary } from '../shared/view';
import { play, setMuted } from './sound';

export interface Toast {
  id: number;
  key: string;
  params?: Record<string, string | number>;
  kind: 'error' | 'info' | 'success';
}

export interface ClientState {
  connected: boolean;
  everConnected: boolean;
  playerId: string | null;
  name: string;
  rooms: string[];
  /** The server allows tester rooms and the tester library. */
  tester: boolean;
  code: string | null;
  view: GameView | null;
  clockOffset: number;
  lang: Lang;
  muted: boolean;
  toasts: Toast[];
}

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: fine */
    }
  },
};

// Keys from when the game was called Monopoly 2026 ("mono.*"): keep the player's identity and preferences.
for (const k of ['lang', 'name', 'muted', 'token', 'room']) {
  const old = ls.get(`mono.${k}`);
  if (old !== null && ls.get(`bailout.${k}`) === null) ls.set(`bailout.${k}`, old);
  if (old !== null) ls.set(`mono.${k}`, null);
}

function detectLang(): Lang {
  const saved = ls.get('bailout.lang');
  if (saved === 'en' || saved === 'ru') return saved;
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

type Listener = () => void;
type EventListener = (events: GameEvent[], view: GameView) => void;

class Store {
  state: ClientState = {
    connected: false,
    everConnected: false,
    playerId: null,
    name: ls.get('bailout.name') ?? '',
    rooms: [],
    tester: false,
    code: null,
    view: null,
    clockOffset: 0,
    lang: detectLang(),
    muted: ls.get('bailout.muted') === '1',
    toasts: [],
  };
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private socket: Socket<ServerToClient, ClientToServer> | null = null;
  private toastId = 0;
  private actionSeq = 0;

  constructor() {
    setMuted(this.state.muted);
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  onEvents(l: EventListener): () => void {
    this.eventListeners.add(l);
    return () => {
      this.eventListeners.delete(l);
    };
  }
  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  connect() {
    if (this.socket) return;
    const socket: Socket<ServerToClient, ClientToServer> = io({
      auth: (cb) => cb({ token: ls.get('bailout.token') ?? undefined, name: this.state.name || undefined }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 4000,
    });
    this.socket = socket;
    socket.on('connect', () => this.set({ connected: true, everConnected: true }));
    socket.on('disconnect', () => this.set({ connected: false }));
    socket.on('session', (s) => {
      ls.set('bailout.token', s.token);
      this.set({ playerId: s.playerId, rooms: s.rooms, tester: !!s.tester, name: this.state.name || s.name });
      // Recover after refresh / reconnect.
      const want = this.state.code ?? ls.get('bailout.room') ?? (location.hash.length > 1 ? location.hash.slice(1) : null);
      if (want) void this.join(want, true);
    });
    socket.on('state', ({ view, events }) => {
      if (this.state.code && view.code !== this.state.code) return;
      const prevView = this.state.view;
      this.set({ view, clockOffset: view.serverNow - Date.now() });
      if (prevView && events.length) this.eventListeners.forEach((l) => l(events, view));
      this.reactToEvents(events, view);
    });
  }

  private reactToEvents(events: GameEvent[], view: GameView) {
    for (const e of events) {
      switch (e.type) {
        case 'dice': play('dice'); break;
        case 'buy': play('buy'); break;
        case 'rent': play('rent'); break;
        case 'card': play('card'); break;
        case 'inflation': play('alert'); break;
        case 'bankrupt': play('bankrupt'); break;
        case 'win': play('win'); break;
        case 'collect': if (e.playerId === view.you) play('coin'); break;
        case 'tradeOffer':
          if (e.toId === view.you) {
            play('alert');
            const name = view.players.find((p) => p.id === e.fromId)?.name ?? '?';
            this.toast('trade.newOffer', { name }, 'info');
          }
          break;
        default: break;
      }
    }
  }

  serverNow() {
    return Date.now() + this.state.clockOffset;
  }

  toast(key: string, params?: Record<string, string | number>, kind: Toast['kind'] = 'error') {
    const id = ++this.toastId;
    this.set({ toasts: [...this.state.toasts.slice(-3), { id, key, params, kind }] });
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) }), 4500);
  }

  setLang(lang: Lang) {
    ls.set('bailout.lang', lang);
    document.documentElement.lang = lang;
    this.set({ lang });
  }

  setMuted(m: boolean) {
    ls.set('bailout.muted', m ? '1' : '0');
    setMuted(m);
    this.set({ muted: m });
  }

  async setName(name: string) {
    ls.set('bailout.name', name);
    this.set({ name });
    if (this.socket?.connected) await this.emit('profile', { name });
  }

  private emit<K extends 'profile' | 'room:create' | 'room:join' | 'room:leave' | 'rooms:list' | 'tester:library' | 'action'>(
    ev: K,
    payload: Parameters<ClientToServer[K]>[0],
    timeoutMs = 8000,
  ): Promise<{ ok: boolean; error?: string; params?: Record<string, string | number>; code?: string; rooms?: PublicRoom[]; library?: TesterLibrary }> {
    return new Promise((resolve) => {
      const s = this.socket;
      if (!s || !s.connected) return resolve({ ok: false, error: 'common.offline' });
      s.timeout(timeoutMs).emit(ev as 'action', payload as never, ((err: Error | null, res: { ok: boolean; error?: string; code?: string; rooms?: PublicRoom[]; library?: TesterLibrary }) => {
        if (err) resolve({ ok: false, error: 'err.timeout' });
        else resolve(res);
      }) as never);
    });
  }

  async createRoom(visibility: Visibility = 'private', tester = false) {
    const res = await this.emit('room:create', { name: this.state.name, visibility, tester });
    if (!res.ok) return this.toast(res.error ?? 'err.server', res.params);
    this.enterRoom(res.code!);
  }

  /** Quick start: a private room with two bots, ready to go. */
  async playWithBots() {
    await this.createRoom('private');
    if (!this.state.code) return;
    for (let i = 0; i < 2; i++) await this.act({ type: 'addBot' });
  }

  /** Tester quick start: a private tester room with two fast bots. */
  async startTestGame() {
    await this.createRoom('private', true);
    if (!this.state.code) return;
    for (let i = 0; i < 2; i++) await this.act({ type: 'addBot' });
  }

  private library: Promise<TesterLibrary | null> | null = null;
  /** Every card, quiz question (with answers) and inflation event; cached after the first load. */
  testerLibrary(): Promise<TesterLibrary | null> {
    this.library ??= this.emit('tester:library', {}).then((res) => {
      if (!res.ok) {
        this.library = null;
        return null;
      }
      return res.library ?? null;
    });
    return this.library;
  }

  /** Open public lobbies; empty when offline (the menu simply shows none). */
  async listRooms(): Promise<PublicRoom[]> {
    const res = await this.emit('rooms:list', {});
    return res.ok ? res.rooms ?? [] : [];
  }

  async join(code: string, silent = false) {
    code = code.toUpperCase().trim();
    if (!code) return;
    const res = await this.emit('room:join', { code, name: this.state.name });
    if (!res.ok) {
      if (silent) {
        ls.set('bailout.room', null);
        if (location.hash) history.replaceState(null, '', location.pathname);
        this.set({ code: null, view: null });
      } else this.toast(res.error ?? 'err.server', res.params);
      return;
    }
    this.enterRoom(code);
  }

  private enterRoom(code: string) {
    ls.set('bailout.room', code);
    history.replaceState(null, '', `#${code}`);
    this.set({ code });
  }

  async leave() {
    const code = this.state.code;
    if (code) await this.emit('room:leave', { code });
    ls.set('bailout.room', null);
    history.replaceState(null, '', location.pathname);
    this.set({ code: null, view: null });
  }

  /** Back to menu without forfeiting (finished games / spectators). */
  exitToMenu() {
    ls.set('bailout.room', null);
    history.replaceState(null, '', location.pathname);
    this.set({ code: null, view: null });
  }

  /** Sends an action with an idempotency id; retries once on timeout with the same id. */
  async act(action: Action): Promise<boolean> {
    const code = this.state.code;
    if (!code) return false;
    const actionId = `${Date.now().toString(36)}-${++this.actionSeq}-${Math.random().toString(36).slice(2, 8)}`;
    let res = await this.emit('action', { code, actionId, action });
    if (!res.ok && res.error === 'err.timeout') res = await this.emit('action', { code, actionId, action });
    if (!res.ok) {
      this.toast(res.error ?? 'err.server', res.params);
      return false;
    }
    return true;
  }
}

export const store = new Store();

export function useStore<T>(sel: (s: ClientState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.state));
}
