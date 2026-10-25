/** Per-viewer projection of game state: hides deck order, dedup ids and other players' private trades. */
import type { GameState, PlayerId, Visibility } from './types.js';

export type GameView = Omit<GameState, 'decks' | 'processed'> & {
  decks: { chance: number; community: number };
  you: PlayerId;
  serverNow: number;
};

export function viewFor(s: GameState, viewerId: PlayerId, now: number): GameView {
  const { decks, processed: _processed, ...rest } = s;
  void _processed;
  return {
    ...rest,
    decks: { chance: decks.chance.length, community: decks.community.length },
    trades: s.trades.filter((t) => t.fromId === viewerId || t.toId === viewerId),
    you: viewerId,
    serverNow: now,
  };
}

/** A public lobby as listed on the main menu. */
export interface PublicRoom {
  code: string;
  hostName: string;
  players: number;
  bots: number;
  maxPlayers: number;
}

/** Wire protocol shared by client and server. */
export interface ServerToClient {
  session: (s: { token: string; playerId: PlayerId; name: string; rooms: string[] }) => void;
  state: (p: { view: GameView; events: import('./types.js').GameEvent[] }) => void;
  kicked: (p: { code: string; reason: string }) => void;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string; params?: Record<string, string | number> }) => void;

export interface ClientToServer {
  profile: (p: { name: string }, ack: Ack) => void;
  'room:create': (p: { name?: string; visibility?: Visibility }, ack: Ack<{ code: string }>) => void;
  'rooms:list': (p: object, ack: Ack<{ rooms: PublicRoom[] }>) => void;
  'room:join': (p: { code: string; name?: string }, ack: Ack<{ code: string }>) => void;
  'room:leave': (p: { code: string }, ack: Ack) => void;
  action: (p: { code: string; actionId: string; action: import('./types.js').Action }, ack: Ack) => void;
}
