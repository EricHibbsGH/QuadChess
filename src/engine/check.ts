/**
 * Check and terminal-position classification (rules.md §8.2, §9).
 *
 * There is no special-case code for pins, discovered checks, double checks or
 * checks from several opponents at once: they all fall out of "a move is legal
 * iff the mover is not in check afterwards".
 */

import { findKing } from './board.js';
import { attackerSquares, checkingOpponentsOf, isSquareAttackedByAny } from './attacks.js';
import type { MoveContext } from './movement.js';
import type { Coord } from './coordinates.js';
import type { PlayerColor } from './pieces.js';

export function kingSquareOf(ctx: MoveContext, color: PlayerColor): Coord | null {
  return findKing(ctx.board, color);
}

/** True when `color`'s king stands on a square attacked by at least one opponent. */
export function isInCheck(ctx: MoveContext, color: PlayerColor): boolean {
  const king = findKing(ctx.board, color);
  if (!king) return false; // eliminated players have no king (INV-3)
  return isSquareAttackedByAny(ctx, king, checkingOpponentsOf(ctx.profile, color));
}

/** Squares of every piece currently checking `color`. Length > 1 is a multi-check. */
export function checkersOf(ctx: MoveContext, color: PlayerColor): readonly Coord[] {
  const king = findKing(ctx.board, color);
  if (!king) return [];
  return attackerSquares(ctx, king, checkingOpponentsOf(ctx.profile, color));
}

/** How many distinct opponents are giving check. */
export function checkingPlayerCount(ctx: MoveContext, color: PlayerColor): number {
  const owners = new Set<PlayerColor>();
  for (const square of checkersOf(ctx, color)) {
    const piece = ctx.board[square.r * 14 + square.c];
    if (piece) owners.add(piece.owner);
  }
  return owners.size;
}

export type TerminalStatus = 'none' | 'checkmate' | 'stalemate';

/**
 * Classifies the position for `color`, given whether they have any legal move.
 * The caller supplies that because generating legal moves needs this module.
 */
export function classifyTerminal(
  ctx: MoveContext,
  color: PlayerColor,
  hasLegalMove: boolean,
): TerminalStatus {
  if (hasLegalMove) return 'none';
  return isInCheck(ctx, color) ? 'checkmate' : 'stalemate';
}
