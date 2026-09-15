/**
 * Networked transport: four browsers, four computers, connected peer-to-peer
 * over WebRTC data channels. Signalling (finding the other browsers) uses the
 * public PeerJS cloud broker, since GitHub Pages cannot run a server of its own.
 *
 * The host is authoritative for ordering only: every intent is relayed through
 * the host to every joiner (a star topology), so all four browsers apply moves
 * in the same order. The host never re-validates a move — `GameSession` already
 * rejects anything illegal, on every peer, the same way it does for pass-and-play.
 */

import Peer, { type DataConnection } from 'peerjs';
import type { PlayerColor } from '../engine/pieces.js';
import type { IntentHandler, MoveIntent, Transport } from './transport.js';

const ROOM_PREFIX = 'quadchess-';
/** Excludes 0/O/1/I, which are easy to mis-type or mis-read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoomCode(): string {
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const value of bytes) code += CODE_ALPHABET[value % CODE_ALPHABET.length];
  return code;
}

export type RoomEvent =
  | { readonly kind: 'assigned'; readonly color: PlayerColor }
  | { readonly kind: 'roster'; readonly colors: readonly PlayerColor[] }
  | { readonly kind: 'peerLeft' }
  | { readonly kind: 'disconnected'; readonly reason: string };

type WireMessage =
  | { readonly type: 'intent'; readonly intent: MoveIntent }
  | { readonly type: 'assign'; readonly color: PlayerColor }
  | { readonly type: 'roster'; readonly colors: readonly PlayerColor[] }
  | { readonly type: 'sync'; readonly json: string };

export interface PeerTransportOptions {
  /** Turn order; seat 0 is always the host's colour. */
  readonly seats: readonly PlayerColor[];
  readonly onRoomEvent: (event: RoomEvent) => void;
  /** Host only: the current game as JSON, sent to every newly-connected joiner. */
  readonly getSyncPayload?: () => string;
  /** Joiner only: applies the host's game snapshot on connecting. */
  readonly onSync?: (json: string) => void;
}

/**
 * Wraps peerjs's callback API in a promise, and rejects if `open` never fires.
 */
function waitForOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (err) => reject(err));
  });
}

export class PeerTransport implements Transport {
  readonly kind = 'peer';
  readonly isLocal = false;

  readonly #peer: Peer;
  readonly #isHost: boolean;
  readonly #seats: readonly PlayerColor[];
  readonly #onRoomEvent: (event: RoomEvent) => void;
  readonly #options: PeerTransportOptions;
  readonly #handlers = new Set<IntentHandler>();
  #hostConnection: DataConnection | null = null;
  /** Host only: joiner connections, in the order they were assigned a seat. */
  readonly #joiners = new Map<DataConnection, PlayerColor>();
  #nextSeatIndex = 1;
  #closed = false;

  private constructor(peer: Peer, isHost: boolean, options: PeerTransportOptions) {
    this.#peer = peer;
    this.#isHost = isHost;
    this.#seats = options.seats;
    this.#onRoomEvent = options.onRoomEvent;
    this.#options = options;
  }

  static async host(options: PeerTransportOptions): Promise<{ transport: PeerTransport; roomCode: string }> {
    const roomCode = randomRoomCode();
    const peer = new Peer(ROOM_PREFIX + roomCode);
    const transport = new PeerTransport(peer, true, options);
    await waitForOpen(peer);
    peer.on('connection', (conn) => transport.#acceptJoiner(conn));
    peer.on('disconnected', () => transport.#onRoomEvent({ kind: 'disconnected', reason: 'Lost the signalling connection.' }));
    return { transport, roomCode };
  }

  static async join(roomCode: string, options: PeerTransportOptions): Promise<PeerTransport> {
    const peer = new Peer();
    const transport = new PeerTransport(peer, false, options);
    await waitForOpen(peer);

    const conn = peer.connect(ROOM_PREFIX + roomCode.trim().toUpperCase(), { reliable: true });
    transport.#hostConnection = conn;

    await new Promise<void>((resolve, reject) => {
      conn.on('open', () => resolve());
      conn.on('error', (err) => reject(err));
    });

    conn.on('data', (data) => transport.#handleWire(data as WireMessage));
    conn.on('close', () =>
      transport.#onRoomEvent({ kind: 'disconnected', reason: 'The host ended the game.' }),
    );
    return transport;
  }

  #acceptJoiner(conn: DataConnection): void {
    conn.on('open', () => {
      const color = this.#seats[this.#nextSeatIndex];
      if (!color) {
        // The room is already full.
        conn.close();
        return;
      }
      this.#nextSeatIndex += 1;
      this.#joiners.set(conn, color);
      conn.send({ type: 'assign', color } satisfies WireMessage);
      const payload = this.#options.getSyncPayload?.();
      if (payload) conn.send({ type: 'sync', json: payload } satisfies WireMessage);
      this.#broadcastRoster();
    });

    conn.on('data', (data) => this.#handleWire(data as WireMessage, conn));

    conn.on('close', () => {
      this.#joiners.delete(conn);
      this.#broadcastRoster();
      this.#onRoomEvent({ kind: 'peerLeft' });
    });
  }

  #rosterColors(): readonly PlayerColor[] {
    const host = this.#seats[0];
    if (!host) return [];
    return [host, ...this.#joiners.values()];
  }

  #broadcastRoster(): void {
    const message: WireMessage = { type: 'roster', colors: this.#rosterColors() };
    this.#onRoomEvent({ kind: 'roster', colors: message.colors });
    for (const conn of this.#joiners.keys()) conn.send(message);
  }

  #handleWire(message: WireMessage, from?: DataConnection): void {
    switch (message.type) {
      case 'intent':
        this.#deliver(message.intent);
        if (this.#isHost) {
          const wire: WireMessage = { type: 'intent', intent: message.intent };
          for (const conn of this.#joiners.keys()) {
            if (conn !== from) conn.send(wire);
          }
          // Echo back to the sender: it applies its own move the same way as everyone
          // else's, through `onRemote`, instead of a separate optimistic code path.
          from?.send(wire);
        }
        return;
      case 'assign':
        this.#onRoomEvent({ kind: 'assigned', color: message.color });
        return;
      case 'roster':
        this.#onRoomEvent({ kind: 'roster', colors: message.colors });
        return;
      case 'sync':
        this.#options.onSync?.(message.json);
        return;
    }
  }

  #deliver(intent: MoveIntent): void {
    for (const handler of [...this.#handlers]) handler(intent);
  }

  async send(intent: MoveIntent): Promise<void> {
    if (this.#closed) return;
    if (this.#isHost) {
      this.#deliver(intent);
      const wire: WireMessage = { type: 'intent', intent };
      for (const conn of this.#joiners.keys()) conn.send(wire);
      return;
    }
    this.#hostConnection?.send({ type: 'intent', intent } satisfies WireMessage);
  }

  onRemote(handler: IntentHandler): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#handlers.clear();
    for (const conn of this.#joiners.keys()) conn.close();
    this.#joiners.clear();
    this.#hostConnection?.close();
    this.#peer.destroy();
  }
}
