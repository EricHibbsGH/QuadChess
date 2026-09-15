/**
 * Networked transport: four browsers, four computers, connected peer-to-peer
 * over WebRTC data channels. Signalling (finding the other browsers) uses the
 * public PeerJS cloud broker, since GitHub Pages cannot run a server of its own.
 *
 * The host is authoritative for ordering only: every intent is relayed through
 * the host to every joiner (a star topology), so all four browsers apply moves
 * in the same order. The host never re-validates a move — `GameSession` already
 * rejects anything illegal, on every peer, the same way it does for pass-and-play.
 *
 * Seats are claimed, not handed out: a joiner is shown which colours are still
 * free and picks one, so friends can deliberately end up on the same team.
 */

import Peer, { type DataConnection } from 'peerjs';
import type { PlayerColor } from '../engine/pieces.js';
import type { IntentHandler, MoveIntent, Transport } from './transport.js';

const ROOM_PREFIX = 'quadchess-';
/** Excludes 0/O/1/I, which are easy to mis-type or mis-read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const OPEN_TIMEOUT_MS = 15_000;
const JOIN_TIMEOUT_MS = 12_000;
const MAX_NAME_LENGTH = 24;
const FALLBACK_NAME = 'Player';

/** PeerJS error types that mean the socket dropped, not that the room is gone. */
const TRANSIENT_ERRORS = new Set(['network', 'socket-error', 'socket-closed', 'disconnected']);

function errorType(error: unknown): string {
  return typeof error === 'object' && error !== null && 'type' in error ? String(error.type) : '';
}

export function randomRoomCode(): string {
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const value of bytes) code += CODE_ALPHABET[value % CODE_ALPHABET.length];
  return code;
}

/** Trims and length-caps a name before it is shown on three other people's screens. */
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export interface RoomSeat {
  readonly color: PlayerColor;
  /** Null while the seat is still open. */
  readonly name: string | null;
}

export type RoomEvent =
  /** Joiner: the host has said which seats are free. Pick one, then call `claim`. */
  | { readonly kind: 'seatsOffered'; readonly seats: readonly RoomSeat[] }
  | { readonly kind: 'assigned'; readonly color: PlayerColor }
  | { readonly kind: 'claimRejected'; readonly reason: string; readonly seats: readonly RoomSeat[] }
  | { readonly kind: 'roster'; readonly seats: readonly RoomSeat[] }
  | { readonly kind: 'peerLeft'; readonly name: string }
  | { readonly kind: 'disconnected'; readonly reason: string };

type WireMessage =
  | { readonly type: 'intent'; readonly intent: MoveIntent }
  | { readonly type: 'seats'; readonly seats: readonly RoomSeat[] }
  | { readonly type: 'claim'; readonly color: PlayerColor; readonly name: string }
  | { readonly type: 'assign'; readonly color: PlayerColor }
  | { readonly type: 'claimRejected'; readonly reason: string; readonly seats: readonly RoomSeat[] }
  | { readonly type: 'roster'; readonly seats: readonly RoomSeat[] }
  | { readonly type: 'sync'; readonly json: string };

export interface PeerTransportOptions {
  /** Every colour in the game, in turn order. */
  readonly seats: readonly PlayerColor[];
  /** Host only: the colour the host claims for themselves. */
  readonly hostColor?: PlayerColor;
  /** Host only: reuse an existing code so a shared link survives a page reload. */
  readonly roomCode?: string;
  readonly playerName: string;
  readonly onRoomEvent: (event: RoomEvent) => void;
  /** Host only: the current game as JSON, sent to every newly-seated joiner. */
  readonly getSyncPayload?: () => string;
  /** Joiner only: applies the host's game snapshot on being seated. */
  readonly onSync?: (json: string) => void;
}

function withTimeout<T>(promise: Promise<T>, message: string, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function waitForOpen(peer: Peer): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      peer.on('open', () => resolve());
      peer.on('error', (err) => reject(err));
    }),
    'Could not reach the matchmaking service. Check your connection and try again.',
    OPEN_TIMEOUT_MS,
  );
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
  /** Who is sitting where. Host-owned; joiners hold a replica for display. */
  readonly #names = new Map<PlayerColor, string>();
  #hostConnection: DataConnection | null = null;
  /** Host only: connections that have successfully claimed a seat. */
  readonly #seatByConn = new Map<DataConnection, PlayerColor>();
  #closed = false;

  private constructor(peer: Peer, isHost: boolean, options: PeerTransportOptions) {
    this.#peer = peer;
    this.#isHost = isHost;
    this.#seats = options.seats;
    this.#onRoomEvent = options.onRoomEvent;
    this.#options = options;
  }

  static async host(
    options: PeerTransportOptions,
  ): Promise<{ transport: PeerTransport; roomCode: string; hostColor: PlayerColor }> {
    const hostColor = options.hostColor ?? options.seats[0];
    if (!hostColor) throw new Error('the rules profile has no seats');

    const roomCode = options.roomCode ?? randomRoomCode();
    const peer = new Peer(ROOM_PREFIX + roomCode);
    const transport = new PeerTransport(peer, true, options);
    await waitForOpen(peer);

    transport.#names.set(hostColor, sanitizeName(options.playerName) || FALLBACK_NAME);
    peer.on('connection', (conn) => transport.#acceptJoiner(conn));
    transport.#keepAlive();
    return { transport, roomCode, hostColor };
  }

  /**
   * The broker drops idle signalling sockets even while the tab is open, which
   * de-registers the room and makes the shared link fail with `peer-unavailable`.
   * Reconnect instead of ending the game; existing data channels are unaffected.
   */
  #keepAlive(): void {
    this.#peer.on('disconnected', () => {
      if (this.#closed || this.#peer.destroyed) return;
      try {
        this.#peer.reconnect();
      } catch {
        this.#onRoomEvent({ kind: 'disconnected', reason: 'Lost the connection to the other players.' });
      }
    });

    this.#peer.on('error', (err) => {
      if (this.#closed) return;
      if (TRANSIENT_ERRORS.has(errorType(err))) return;
      // A joiner asking for a room that has gone is their problem, not ours.
      if (errorType(err) === 'peer-unavailable' && this.#isHost) return;
      this.#onRoomEvent({ kind: 'disconnected', reason: err.message || 'The room connection failed.' });
    });
  }

  /** Resolves once connected to the host. The caller then waits for `seatsOffered`. */
  static async join(roomCode: string, options: PeerTransportOptions): Promise<PeerTransport> {
    const peer = new Peer();
    const transport = new PeerTransport(peer, false, options);
    await waitForOpen(peer);

    const conn = peer.connect(ROOM_PREFIX + roomCode.trim().toUpperCase(), { reliable: true });
    transport.#hostConnection = conn;

    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          conn.on('open', () => resolve());
          conn.on('error', (err) => reject(err));
          // An unknown room surfaces as `peer-unavailable` on the peer, not on the
          // connection, so without this listener the join would wait forever.
          peer.on('error', (err) => reject(err));
        }),
        'That game did not answer. The host may have closed their tab.',
        JOIN_TIMEOUT_MS,
      );
    } catch (error) {
      peer.destroy();
      throw errorType(error) === 'peer-unavailable'
        ? new Error('No open game with that code. Room codes only last while the host keeps their tab open, so ask them for a fresh link.')
        : error;
    }

    transport.#keepAlive();
    conn.on('data', (data) => transport.#handleWire(data as WireMessage));
    conn.on('close', () =>
      transport.#onRoomEvent({ kind: 'disconnected', reason: 'The host ended the game.' }),
    );
    return transport;
  }

  /** Joiner: asks the host for a colour. Answered by `assigned` or `claimRejected`. */
  claim(color: PlayerColor, name: string): void {
    const claimed = sanitizeName(name) || FALLBACK_NAME;
    this.#hostConnection?.send({ type: 'claim', color, name: claimed } satisfies WireMessage);
  }

  seats(): readonly RoomSeat[] {
    return this.#seats.map((color) => ({ color, name: this.#names.get(color) ?? null }));
  }

  #acceptJoiner(conn: DataConnection): void {
    conn.on('open', () => {
      conn.send({ type: 'seats', seats: this.seats() } satisfies WireMessage);
    });

    conn.on('data', (data) => this.#handleWire(data as WireMessage, conn));

    conn.on('close', () => {
      const color = this.#seatByConn.get(conn);
      if (!color) return;
      const name = this.#names.get(color) ?? FALLBACK_NAME;
      this.#names.delete(color);
      this.#seatByConn.delete(conn);
      this.#broadcastRoster();
      this.#onRoomEvent({ kind: 'peerLeft', name });
    });
  }

  #handleClaim(conn: DataConnection, color: PlayerColor, name: string): void {
    if (!this.#seats.includes(color)) {
      conn.send({
        type: 'claimRejected',
        reason: 'That colour is not in this game.',
        seats: this.seats(),
      } satisfies WireMessage);
      return;
    }
    if (this.#names.has(color)) {
      conn.send({
        type: 'claimRejected',
        reason: `${this.#names.get(color) ?? 'Someone'} already took that colour.`,
        seats: this.seats(),
      } satisfies WireMessage);
      return;
    }

    this.#names.set(color, name);
    this.#seatByConn.set(conn, color);
    conn.send({ type: 'assign', color } satisfies WireMessage);
    const payload = this.#options.getSyncPayload?.();
    if (payload) conn.send({ type: 'sync', json: payload } satisfies WireMessage);
    this.#broadcastRoster();
  }

  #broadcastRoster(): void {
    const seats = this.seats();
    this.#onRoomEvent({ kind: 'roster', seats });
    const message: WireMessage = { type: 'roster', seats };
    for (const conn of this.#seatByConn.keys()) conn.send(message);
  }

  #handleWire(message: WireMessage, from?: DataConnection): void {
    switch (message.type) {
      case 'intent':
        this.#deliver(message.intent);
        if (this.#isHost) {
          const wire: WireMessage = { type: 'intent', intent: message.intent };
          for (const conn of this.#seatByConn.keys()) {
            if (conn !== from) conn.send(wire);
          }
          // Echo back to the sender: it applies its own move the same way as everyone
          // else's, through `onRemote`, instead of a separate optimistic code path.
          from?.send(wire);
        }
        return;
      case 'claim':
        if (this.#isHost && from) this.#handleClaim(from, message.color, sanitizeName(message.name));
        return;
      case 'seats':
        this.#onRoomEvent({ kind: 'seatsOffered', seats: message.seats });
        return;
      case 'assign':
        this.#onRoomEvent({ kind: 'assigned', color: message.color });
        return;
      case 'claimRejected':
        this.#onRoomEvent({ kind: 'claimRejected', reason: message.reason, seats: message.seats });
        return;
      case 'roster':
        for (const seat of message.seats) {
          if (seat.name) this.#names.set(seat.color, seat.name);
          else this.#names.delete(seat.color);
        }
        this.#onRoomEvent({ kind: 'roster', seats: message.seats });
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
      for (const conn of this.#seatByConn.keys()) conn.send(wire);
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
    for (const conn of this.#seatByConn.keys()) conn.close();
    this.#seatByConn.clear();
    this.#hostConnection?.close();
    this.#peer.destroy();
  }
}
