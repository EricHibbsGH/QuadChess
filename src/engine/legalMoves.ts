/**
 * Legal move generation (rules.md §8.3) and board mutation.
 *
 * A pseudo-legal move is legal iff, after applying it to a COPY of the board,
 * the mover is not in check. Castling is generated here rather than in
 * `movement.ts` because it needs attack information.
 */

import { castlePlans, pieceAt, withUpdates, type Board } from './board.js';
import { coordToIndex, type Coord } from './coordinates.js';
import { isInCheck } from './check.js';
import { isSquareAttackedByAny } from './attacks.js';
import { moveKey, pseudoLegalMoves, pseudoLegalMovesFrom, type Move, type MoveContext } from './movement.js';
import { promoteTo, withMoved, type Piece, type PlayerColor } from './pieces.js';
import { areAllies, type RulesProfile } from '../rules/types.js';

/**
 * Applies a move to a copy of the board. Handles the captured square (which is
 * not the destination for en passant), promotion, the castling rook transfer and
 * the `hasMoved` flags. The input board is never mutated.
 */
export function applyMoveToBoard(board: Board, move: Move, profile: RulesProfile): Board {
  const mover = pieceAt(board, move.from);
  if (!mover) return board;

  const updates: (readonly [number, Piece | null])[] = [];

  if (move.capture) {
    updates.push([coordToIndex(move.capture.at), null]);
  }
  updates.push([coordToIndex(move.from), null]);

  const landed = move.promotion ? promoteTo(mover, move.promotion) : withMoved(mover);
  updates.push([coordToIndex(move.to), landed]);

  if (move.castle) {
    const plan = castlePlans(profile, move.color).find((p) => p.side === move.castle);
    if (plan) {
      const rook = pieceAt(board, plan.rookFrom);
      updates.push([coordToIndex(plan.rookFrom), null]);
      if (rook) updates.push([coordToIndex(plan.rookTo), withMoved(rook)]);
    }
  }

  return withUpdates(board, updates);
}

/** The players whose attacks block castling through a square. */
function castlingThreats(profile: RulesProfile, color: PlayerColor): readonly PlayerColor[] {
  return profile.turnOrder.filter((other) => {
    if (other === color) return false;
    if (areAllies(profile, color, other)) return profile.castlingConsidersTeammateAttacks;
    return true;
  });
}

export function castleMoves(ctx: MoveContext, color: PlayerColor): readonly Move[] {
  const { profile, board } = ctx;
  if (!profile.castling) return [];

  const plans = castlePlans(profile, color);
  if (plans.length === 0) return [];

  const out: Move[] = [];
  let kingInCheck: boolean | null = null;
  const threats = castlingThreats(profile, color);

  for (const plan of plans) {
    const king = pieceAt(board, plan.kingFrom);
    if (!king || king.type !== 'K' || king.owner !== color || king.hasMoved || king.dead) continue;

    const rook = pieceAt(board, plan.rookFrom);
    if (!rook || rook.type !== 'R' || rook.owner !== color || rook.hasMoved || rook.dead) continue;

    if (plan.mustBeEmpty.some((square) => pieceAt(board, square) !== null)) continue;

    // Condition 3: the king is not currently in check (computed at most once).
    kingInCheck ??= isInCheck(ctx, color);
    if (kingInCheck) continue;

    // Condition 4: the king neither transits nor lands on an attacked square.
    if (plan.kingPath.some((square) => isSquareAttackedByAny(ctx, square, threats))) continue;

    out.push({
      from: plan.kingFrom,
      to: plan.kingTo,
      piece: 'K',
      color,
      capture: null,
      promotion: null,
      castle: plan.side,
      enPassant: false,
      doubleStep: false,
    });
  }

  return out;
}

function isSelfSafe(ctx: MoveContext, move: Move): boolean {
  if (!ctx.profile.mustResolveOwnCheck) return true;
  const board = applyMoveToBoard(ctx.board, move, ctx.profile);
  return !isInCheck({ ...ctx, board }, move.color);
}

/** All legal moves for `color`, castling included. */
export function legalMoves(ctx: MoveContext, color: PlayerColor): readonly Move[] {
  const candidates = [...pseudoLegalMoves(ctx, color), ...castleMoves(ctx, color)];
  return candidates.filter((move) => isSelfSafe(ctx, move));
}

/** Legal moves for the piece standing on `from`, castling included when it is the king. */
export function legalMovesFrom(ctx: MoveContext, from: Coord): readonly Move[] {
  const piece = pieceAt(ctx.board, from);
  if (!piece || piece.dead) return [];
  const candidates: Move[] = [...pseudoLegalMovesFrom(ctx, from)];
  if (piece.type === 'K') {
    candidates.push(
      ...castleMoves(ctx, piece.owner).filter(
        (move) => move.from.r === from.r && move.from.c === from.c,
      ),
    );
  }
  return candidates.filter((move) => isSelfSafe(ctx, move));
}

/** Early-exit existence test, used for checkmate and stalemate detection. */
export function hasLegalMove(ctx: MoveContext, color: PlayerColor): boolean {
  for (const move of pseudoLegalMoves(ctx, color)) {
    if (isSelfSafe(ctx, move)) return true;
  }
  return castleMoves(ctx, color).some((move) => isSelfSafe(ctx, move));
}

/**
 * Validates a caller-supplied move against generated legal moves. This is the
 * only entry point the UI and any transport may use, so an illegal move can
 * never be submitted through the engine API.
 */
export function findLegalMove(ctx: MoveContext, candidate: Partial<Move> & { from: Coord; to: Coord }): Move | null {
  const piece = pieceAt(ctx.board, candidate.from);
  if (!piece) return null;
  const options = legalMovesFrom(ctx, candidate.from);
  const matches = options.filter(
    (move) => move.to.r === candidate.to.r && move.to.c === candidate.to.c,
  );
  if (matches.length === 0) return null;
  if (candidate.promotion) {
    return matches.find((move) => move.promotion === candidate.promotion) ?? null;
  }
  if (matches.length === 1) return matches[0] ?? null;
  // Several matches means an unresolved promotion choice; the caller must pick.
  return null;
}

export function legalMoveKeys(ctx: MoveContext, color: PlayerColor): ReadonlySet<string> {
  return new Set(legalMoves(ctx, color).map(moveKey));
}
