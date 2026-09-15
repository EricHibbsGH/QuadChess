/**
 * Pseudo-legal move generation (rules.md §5, §6).
 *
 * "Pseudo-legal" means geometry, path clearance and occupancy are satisfied but
 * the mover may still be leaving their own king in check. `legalMoves.ts` does
 * that filtering, and adds castling (which needs attack information).
 *
 * Every generated square passes through `isPlayable`, so no piece can occupy or
 * travel through a missing corner.
 */

import {
  forwardVector,
  isOnHomeLine,
  isOnPromotionLine,
  isPlayable,
  pawnCaptureVectors,
  type Coord,
  type Vec,
} from './coordinates.js';
import { pieceAt, type Board, type CastleSide } from './board.js';
import type { Piece, PieceType, PlayerColor } from './pieces.js';
import { areAllies, seatOf, type RulesProfile } from '../rules/types.js';

export interface CaptureInfo {
  readonly at: Coord;
  readonly type: PieceType;
  readonly owner: PlayerColor;
  readonly dead: boolean;
}

export interface Move {
  readonly from: Coord;
  readonly to: Coord;
  readonly piece: PieceType;
  readonly color: PlayerColor;
  readonly capture: CaptureInfo | null;
  readonly promotion: PieceType | null;
  readonly castle: CastleSide | null;
  /** This move captures en passant. */
  readonly enPassant: boolean;
  /** This move is a pawn double step, and therefore creates an en-passant target. */
  readonly doubleStep: boolean;
}

export interface EnPassantTarget {
  /** The square the double-stepping pawn skipped over. */
  readonly square: Coord;
  /** Where that pawn actually stands, and what a capturer removes. */
  readonly pawnAt: Coord;
  readonly owner: PlayerColor;
  readonly createdAtPly: number;
  /** Exclusive: the target is live while `ply < expiresAtPly`. */
  readonly expiresAtPly: number;
}

/** The minimum state move generation needs. Keeps this module free of GameState. */
export interface MoveContext {
  readonly board: Board;
  readonly profile: RulesProfile;
  readonly enPassant: EnPassantTarget | null;
  readonly ply: number;
}

const ROOK_DIRS: readonly Vec[] = Object.freeze([
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
]);

const BISHOP_DIRS: readonly Vec[] = Object.freeze([
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
]);

const QUEEN_DIRS: readonly Vec[] = Object.freeze([...ROOK_DIRS, ...BISHOP_DIRS]);

const KNIGHT_JUMPS: readonly Vec[] = Object.freeze([
  { dr: -2, dc: -1 },
  { dr: -2, dc: 1 },
  { dr: -1, dc: -2 },
  { dr: -1, dc: 2 },
  { dr: 1, dc: -2 },
  { dr: 1, dc: 2 },
  { dr: 2, dc: -1 },
  { dr: 2, dc: 1 },
]);

const KING_STEPS: readonly Vec[] = QUEEN_DIRS;

export function slidingDirections(type: PieceType): readonly Vec[] {
  switch (type) {
    case 'R':
      return ROOK_DIRS;
    case 'B':
      return BISHOP_DIRS;
    case 'Q':
      return QUEEN_DIRS;
    default:
      return [];
  }
}

export { KNIGHT_JUMPS, KING_STEPS, ROOK_DIRS, BISHOP_DIRS, QUEEN_DIRS };

function step(coord: Coord, vec: Vec): Coord {
  return { r: coord.r + vec.dr, c: coord.c + vec.dc };
}

/** A piece blocks a ray if it is present at all — dead pieces included (AMB-8). */
function blocks(piece: Piece | null, profile: RulesProfile): boolean {
  if (!piece) return false;
  if (piece.dead) return profile.deadPiecesBlock;
  return true;
}

/**
 * Can `mover` land on `target`'s square as a capture?
 * Allies are never capturable; dead pieces only when the profile allows it;
 * kings only when `kingCaptureAllowed` (off in both shipped profiles).
 */
function canCapture(profile: RulesProfile, mover: PlayerColor, target: Piece): boolean {
  if (areAllies(profile, mover, target.owner)) return false;
  if (target.dead) return profile.deadPiecesCapturable;
  if (target.type === 'K') return profile.kingCaptureAllowed;
  return true;
}

function captureInfo(target: Piece, at: Coord): CaptureInfo {
  return { at, type: target.type, owner: target.owner, dead: target.dead };
}

function baseMove(
  from: Coord,
  to: Coord,
  piece: Piece,
  capture: CaptureInfo | null,
  extra: Partial<Move> = {},
): Move {
  return {
    from,
    to,
    piece: piece.type,
    color: piece.owner,
    capture,
    promotion: null,
    castle: null,
    enPassant: false,
    doubleStep: false,
    ...extra,
  };
}

// --------------------------------------------------------------------------
// Attack squares — what a piece controls, used only for check detection
// --------------------------------------------------------------------------

/**
 * Squares this piece controls, ignoring whose piece stands there and ignoring
 * whether moving would expose its own king. Pawns control only their capture
 * vectors. Castling is never an attack.
 */
export function attackSquaresFrom(ctx: MoveContext, from: Coord): readonly Coord[] {
  const piece = pieceAt(ctx.board, from);
  if (!piece) return [];
  if (piece.dead && !ctx.profile.deadPiecesGiveCheck) return [];

  const out: Coord[] = [];
  const { profile, board } = ctx;

  if (piece.type === 'P') {
    const seat = seatOf(profile, piece.owner);
    for (const vec of pawnCaptureVectors(seat)) {
      const to = step(from, vec);
      if (isPlayable(to.r, to.c)) out.push(to);
    }
    return out;
  }

  if (piece.type === 'N') {
    for (const vec of KNIGHT_JUMPS) {
      const to = step(from, vec);
      if (isPlayable(to.r, to.c)) out.push(to);
    }
    return out;
  }

  if (piece.type === 'K') {
    for (const vec of KING_STEPS) {
      const to = step(from, vec);
      if (isPlayable(to.r, to.c)) out.push(to);
    }
    return out;
  }

  for (const dir of slidingDirections(piece.type)) {
    let cursor = step(from, dir);
    while (isPlayable(cursor.r, cursor.c)) {
      out.push(cursor);
      if (blocks(pieceAt(board, cursor), profile)) break;
      cursor = step(cursor, dir);
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Pseudo-legal moves
// --------------------------------------------------------------------------

/** All pseudo-legal moves for the piece standing on `from`. Castling excluded. */
export function pseudoLegalMovesFrom(ctx: MoveContext, from: Coord): readonly Move[] {
  const piece = pieceAt(ctx.board, from);
  if (!piece || piece.dead) return [];
  switch (piece.type) {
    case 'P':
      return pawnMoves(ctx, from, piece);
    case 'N':
      return leaperMoves(ctx, from, piece, KNIGHT_JUMPS);
    case 'K':
      return leaperMoves(ctx, from, piece, KING_STEPS);
    default:
      return sliderMoves(ctx, from, piece);
  }
}

export function pseudoLegalMoves(ctx: MoveContext, color: PlayerColor): readonly Move[] {
  const out: Move[] = [];
  for (let r = 0; r < 14; r += 1) {
    for (let c = 0; c < 14; c += 1) {
      const piece = ctx.board[r * 14 + c];
      if (!piece || piece.owner !== color || piece.dead) continue;
      out.push(...pseudoLegalMovesFrom(ctx, { r, c }));
    }
  }
  return out;
}

function sliderMoves(ctx: MoveContext, from: Coord, piece: Piece): readonly Move[] {
  const out: Move[] = [];
  for (const dir of slidingDirections(piece.type)) {
    let cursor = step(from, dir);
    while (isPlayable(cursor.r, cursor.c)) {
      const target = pieceAt(ctx.board, cursor);
      if (!target) {
        out.push(baseMove(from, cursor, piece, null));
        cursor = step(cursor, dir);
        continue;
      }
      if (canCapture(ctx.profile, piece.owner, target)) {
        out.push(baseMove(from, cursor, piece, captureInfo(target, cursor)));
      }
      break; // occupied squares always stop the ray
    }
  }
  return out;
}

function leaperMoves(ctx: MoveContext, from: Coord, piece: Piece, vectors: readonly Vec[]): readonly Move[] {
  const out: Move[] = [];
  for (const vec of vectors) {
    const to = step(from, vec);
    // Rule T-2: a knight leaps, so only the destination's playability matters.
    if (!isPlayable(to.r, to.c)) continue;
    const target = pieceAt(ctx.board, to);
    if (!target) {
      out.push(baseMove(from, to, piece, null));
      continue;
    }
    if (canCapture(ctx.profile, piece.owner, target)) {
      out.push(baseMove(from, to, piece, captureInfo(target, to)));
    }
  }
  return out;
}

function pawnMoves(ctx: MoveContext, from: Coord, piece: Piece): readonly Move[] {
  const { profile, board } = ctx;
  const seat = seatOf(profile, piece.owner);

  // A pawn that has reached its promotion line has nowhere further to go. With
  // `promotionMandatory` (the default) this state is unreachable.
  if (isOnPromotionLine(seat, from, profile.promotionZone)) return [];

  const out: Move[] = [];
  const forward = forwardVector(seat);

  const one = step(from, forward);
  if (isPlayable(one.r, one.c) && !pieceAt(board, one)) {
    pushPawnMove(out, ctx, from, one, piece, null, {});

    const canDouble =
      profile.pawnDoubleStep === 'fromHomeLineOnly' && !piece.hasMoved && isOnHomeLine(seat, from);
    if (canDouble) {
      const two = step(one, forward);
      if (isPlayable(two.r, two.c) && !pieceAt(board, two)) {
        pushPawnMove(out, ctx, from, two, piece, null, { doubleStep: true });
      }
    }
  }

  for (const vec of pawnCaptureVectors(seat)) {
    const to = step(from, vec);
    if (!isPlayable(to.r, to.c)) continue;

    const target = pieceAt(board, to);
    if (target) {
      if (canCapture(profile, piece.owner, target)) {
        pushPawnMove(out, ctx, from, to, piece, captureInfo(target, to), {});
      }
      continue;
    }

    const ep = ctx.enPassant;
    if (
      profile.enPassant &&
      ep !== null &&
      ctx.ply < ep.expiresAtPly &&
      ep.square.r === to.r &&
      ep.square.c === to.c &&
      !areAllies(profile, piece.owner, ep.owner)
    ) {
      const victim = pieceAt(board, ep.pawnAt);
      if (victim && victim.type === 'P' && victim.owner === ep.owner) {
        pushPawnMove(out, ctx, from, to, piece, captureInfo(victim, ep.pawnAt), { enPassant: true });
      }
    }
  }

  return out;
}

function pushPawnMove(
  out: Move[],
  ctx: MoveContext,
  from: Coord,
  to: Coord,
  piece: Piece,
  capture: CaptureInfo | null,
  extra: Partial<Move>,
): void {
  const { profile } = ctx;
  const seat = seatOf(profile, piece.owner);
  if (isOnPromotionLine(seat, to, profile.promotionZone)) {
    const choices =
      profile.promotionChoice === 'alwaysQueen' ? (['Q'] as const) : profile.promotionPieces;
    for (const promotion of choices) {
      out.push(baseMove(from, to, piece, capture, { ...extra, promotion }));
    }
    return;
  }
  out.push(baseMove(from, to, piece, capture, extra));
}

// --------------------------------------------------------------------------
// Utilities shared with the UI
// --------------------------------------------------------------------------

export function movesEqual(a: Move, b: Move): boolean {
  return (
    a.from.r === b.from.r &&
    a.from.c === b.from.c &&
    a.to.r === b.to.r &&
    a.to.c === b.to.c &&
    a.promotion === b.promotion &&
    a.castle === b.castle
  );
}

export function moveKey(move: Move): string {
  return `${move.from.r},${move.from.c}-${move.to.r},${move.to.c}-${move.promotion ?? ''}-${move.castle ?? ''}`;
}
