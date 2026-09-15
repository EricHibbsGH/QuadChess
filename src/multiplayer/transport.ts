/**
 * The networking seam (architecture.md §6).
 *
 * The engine never imports this module and never knows a transport exists. The
 * composition root sends a player's intent through the transport and applies
 * whatever comes back out, so a future networked transport can be added without
 * touching a single rule.
 *
 * Only `LocalTransport` exists. Nothing in the shipped application opens a
 * socket, and there is no signalling server, so online play does not work.
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
  | { readonly kind: 'draw'; readonly color: PlayerColor };

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
