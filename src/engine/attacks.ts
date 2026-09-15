/**
 * Attack detection (rules.md §8.1).
 *
 * `isSquareAttackedBy` scans OUTWARD from the target square rather than
 * enumerating every enemy move, because legality filtering calls it once per
 * candidate move. The two directions agree by construction and are cross-checked
 * against `attackSquaresFrom` in the test suite.
 */

import { isPlayable, pawnCaptureVectors, type Coord, type Vec } from './coordinates.js';
import { pieceAt } from './board.js';
import {
  KING_STEPS,
  KNIGHT_JUMPS,
  QUEEN_DIRS,
  attackSquaresFrom,
  type MoveContext,
} from './movement.js';
import type { Piece, PlayerColor } from './pieces.js';
import { areAllies, seatOf, type RulesProfile } from '../rules/types.js';

function canAttack(piece: Piece, profile: RulesProfile): boolean {
  return piece.dead ? profile.deadPiecesGiveCheck : true;
}

function blocksRay(piece: Piece, profile: RulesProfile): boolean {
  return piece.dead ? profile.deadPiecesBlock : true;
}

function isOrthogonal(dir: Vec): boolean {
  return dir.dr === 0 || dir.dc === 0;
}

/** Does `by` attack `target`? Pawn pushes are not attacks; castling is not an attack. */
export function isSquareAttackedBy(ctx: MoveContext, target: Coord, by: PlayerColor): boolean {
  const { board, profile } = ctx;

  // Pawns: a pawn on `target - vec` attacks `target` along `vec`.
  const seat = seatOf(profile, by);
  for (const vec of pawnCaptureVectors(seat)) {
    const src = { r: target.r - vec.dr, c: target.c - vec.dc };
    if (!isPlayable(src.r, src.c)) continue;
    const piece = pieceAt(board, src);
    if (piece && piece.owner === by && piece.type === 'P' && canAttack(piece, profile)) return true;
  }

  // Knights (the jump set is symmetric, so no negation is needed).
  for (const vec of KNIGHT_JUMPS) {
    const src = { r: target.r + vec.dr, c: target.c + vec.dc };
    if (!isPlayable(src.r, src.c)) continue;
    const piece = pieceAt(board, src);
    if (piece && piece.owner === by && piece.type === 'N' && canAttack(piece, profile)) return true;
  }

  // Adjacent king.
  for (const vec of KING_STEPS) {
    const src = { r: target.r + vec.dr, c: target.c + vec.dc };
    if (!isPlayable(src.r, src.c)) continue;
    const piece = pieceAt(board, src);
    if (piece && piece.owner === by && piece.type === 'K' && canAttack(piece, profile)) return true;
  }

  // Sliders: walk outward until something stops the ray.
  for (const dir of QUEEN_DIRS) {
    let cursor = { r: target.r + dir.dr, c: target.c + dir.dc };
    while (isPlayable(cursor.r, cursor.c)) {
      const piece = pieceAt(board, cursor);
      if (piece) {
        const matches =
          piece.owner === by &&
          canAttack(piece, profile) &&
          (piece.type === 'Q' ||
            (isOrthogonal(dir) ? piece.type === 'R' : piece.type === 'B'));
        if (matches) return true;
        if (blocksRay(piece, profile)) break;
      }
      cursor = { r: cursor.r + dir.dr, c: cursor.c + dir.dc };
    }
  }

  return false;
}

export function isSquareAttackedByAny(
  ctx: MoveContext,
  target: Coord,
  colors: readonly PlayerColor[],
): boolean {
  return colors.some((color) => isSquareAttackedBy(ctx, target, color));
}

/**
 * Every square from which `colors` attack `target`. Used for check highlighting
 * and for multi-check reporting; the boolean form above is the hot path.
 */
export function attackerSquares(
  ctx: MoveContext,
  target: Coord,
  colors: readonly PlayerColor[],
): readonly Coord[] {
  const out: Coord[] = [];
  const wanted = new Set(colors);
  for (let r = 0; r < 14; r += 1) {
    for (let c = 0; c < 14; c += 1) {
      const piece = ctx.board[r * 14 + c];
      if (!piece || !wanted.has(piece.owner)) continue;
      if (!canAttack(piece, ctx.profile)) continue;
      const from = { r, c };
      for (const square of attackSquaresFrom(ctx, from)) {
        if (square.r === target.r && square.c === target.c) {
          out.push(from);
          break;
        }
      }
    }
  }
  return out;
}

/** All squares `color` currently controls. Used by tests and by UI threat display. */
export function attackedSquareSet(ctx: MoveContext, color: PlayerColor): ReadonlySet<number> {
  const out = new Set<number>();
  for (let r = 0; r < 14; r += 1) {
    for (let c = 0; c < 14; c += 1) {
      const piece = ctx.board[r * 14 + c];
      if (!piece || piece.owner !== color) continue;
      for (const square of attackSquaresFrom(ctx, { r, c })) {
        out.add(square.r * 14 + square.c);
      }
    }
  }
  return out;
}

/**
 * The players whose attacks can check `color`. Allies are excluded because an
 * ally can never capture your king (rules.md §8.2).
 */
export function checkingOpponentsOf(profile: RulesProfile, color: PlayerColor): readonly PlayerColor[] {
  return profile.turnOrder.filter((other) => {
    if (other === color) return false;
    if (areAllies(profile, color, other)) return profile.teammateAttacksGiveCheck;
    return true;
  });
}
