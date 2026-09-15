/**
 * The networking seam (architecture.md §6).
 *
 * The engine never imports this module and never knows a transport exists. The
 * composition root sends a player's intent through the transport and applies
 * whatever comes back out, so a transport can be swapped without touching a
 * single rule.
 *
 * Two transports exist: `LocalTransport` for pass-and-play on one device, and
 * `PeerTransport` (multiplayer/peerTransport.ts) for four browsers on four
 * computers, connected peer-to-peer over WebRTC.
 */

import type { PieceType, PlayerColor } from '../engine/pieces.js';
import type { Coord } from '../engine/coordinates.js';

export type MoveIntent =
  | {
      readonly kind: 'move';
      readonly color: PlayerColor;
      readonly from: Coord;
      readonly to: Coord;
      readonly promotion?: PieceType | null;
    }
  | { readonly kind: 'resign'; readonly color: PlayerColor }
  | { readonly kind: 'timeout'; readonly color: PlayerColor }
  | { readonly kind: 'draw'; readonly color: PlayerColor }
  /** Starts a new game (or switches rules profile), kept in sync across every peer. */
  | { readonly kind: 'reset'; readonly profileId: string };

export type IntentHandler = (intent: MoveIntent) => void;

export interface Transport {
  /** Stable identifier used in the UI and in diagnostics. */
  readonly kind: string;
  /** True when all seats are played on this device. */
  readonly isLocal: boolean;
  send(intent: MoveIntent): Promise<void>;
  /** Returns an unsubscribe function. */
  onRemote(handler: IntentHandler): () => void;
  close(): void;
}
