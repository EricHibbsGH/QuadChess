/**
 * Board storage and the generated initial position.
 *
 * The board is a flat 196-cell array indexed `r * 14 + c`. Corner cells are
 * permanently `null` and are additionally guarded by `isPlayable`, so the flat
 * layout stays an implementation detail and never becomes a rule.
 *
 * All writes return a new array: state transitions are pure (INV-9).
 */

import {
  BOARD_SIZE,
  CELL_COUNT,
  backLineSquares,
  coordToIndex,
  indexToCoord,
  isPlayableIndex,
  pawnLineSquares,
  toNotation,
  type Coord,
} from './coordinates.js';
import { makePiece, type Piece, type PlayerColor, type PieceType } from './pieces.js';
import { seatOf, type RulesProfile } from '../rules/types.js';

export type Board = readonly (Piece | null)[];

export interface PlacedPiece {
  readonly coord: Coord;
  readonly piece: Piece;
}

export function emptyBoard(): Board {
  return Object.freeze(new Array<Piece | null>(CELL_COUNT).fill(null));
}

export function pieceAtIndex(board: Board, index: number): Piece | null {
  return board[index] ?? null;
}

export function pieceAt(board: Board, coord: Coord): Piece | null {
  return board[coordToIndex(coord)] ?? null;
}

/** Returns a new board with a single cell replaced. */
export function setPiece(board: Board, coord: Coord, piece: Piece | null): Board {
  return withUpdates(board, [[coordToIndex(coord), piece]]);
}

/** Returns a new board with several cells replaced, copying the array once. */
export function withUpdates(board: Board, updates: readonly (readonly [number, Piece | null])[]): Board {
  const next = board.slice();
  for (const [index, piece] of updates) {
    next[index] = piece;
  }
  return next;
}

export function findKing(board: Board, owner: PlayerColor): Coord | null {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    if (piece && piece.type === 'K' && piece.owner === owner && !piece.dead) {
      return indexToCoord(i);
    }
  }
  return null;
}

export function piecesOf(board: Board, owner: PlayerColor): readonly PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    if (piece && piece.owner === owner) out.push({ coord: indexToCoord(i), piece });
  }
  return out;
}

export function allPieces(board: Board): readonly PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    if (piece) out.push({ coord: indexToCoord(i), piece });
  }
  return out;
}

export function countPieces(board: Board): number {
  let total = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (board[i]) total += 1;
  }
  return total;
}

// --------------------------------------------------------------------------
// Initial position (rules.md §4)
// --------------------------------------------------------------------------

/**
 * Generated from one statement: each army's back line, read from the OWNER's
 * left to right, is `profile.backLineOrder`. That is what makes the position
 * exactly 90-degree rotationally symmetric.
 */
export function initialBoard(profile: RulesProfile): Board {
  const updates: (readonly [number, Piece | null])[] = [];
  for (const color of profile.turnOrder) {
    const seat = seatOf(profile, color);
    const back = backLineSquares(seat);
    const pawns = pawnLineSquares(seat);
    profile.backLineOrder.forEach((type, i) => {
      const square = back[i];
      if (square) updates.push([coordToIndex(square), makePiece(type, color)]);
    });
    for (const square of pawns) {
      updates.push([coordToIndex(square), makePiece('P', color)]);
    }
  }
  return withUpdates(emptyBoard(), updates);
}

// --------------------------------------------------------------------------
// Castling geometry (rules.md §7)
// --------------------------------------------------------------------------

export type CastleSide = 'short' | 'long';

export interface CastlePlan {
  readonly side: CastleSide;
  readonly kingFrom: Coord;
  readonly kingTo: Coord;
  readonly rookFrom: Coord;
  readonly rookTo: Coord;
  /** Squares that must be empty, strictly between king and rook. */
  readonly mustBeEmpty: readonly Coord[];
  /** Squares the king transits, including its destination, excluding its origin. */
  readonly kingPath: readonly Coord[];
}

/**
 * Derived from the back line rather than tabulated, so all eight plans (four
 * armies x two sides) follow from the same rule and stay rotationally
 * consistent. Returns an empty array if the profile's back line has no king or
 * fewer than two rooks.
 */
export function castlePlans(profile: RulesProfile, color: PlayerColor): readonly CastlePlan[] {
  const seat = seatOf(profile, color);
  const line = backLineSquares(seat);
  const order = profile.backLineOrder;
  const kingIndex = order.indexOf('K');
  if (kingIndex < 0) return [];

  const rookIndexes = order.reduce<number[]>((acc, type, i) => {
    if (type === 'R') acc.push(i);
    return acc;
  }, []);

  const plans: CastlePlan[] = [];
  for (const rookIndex of rookIndexes) {
    const direction = rookIndex > kingIndex ? 1 : -1;
    const side: CastleSide = direction === 1 ? 'short' : 'long';
    const kingToIndex = kingIndex + 2 * direction;
    const rookToIndex = kingIndex + direction;

    const kingFrom = line[kingIndex];
    const kingTo = line[kingToIndex];
    const rookFrom = line[rookIndex];
    const rookTo = line[rookToIndex];
    if (!kingFrom || !kingTo || !rookFrom || !rookTo) continue;

    const mustBeEmpty: Coord[] = [];
    for (let i = Math.min(kingIndex, rookIndex) + 1; i < Math.max(kingIndex, rookIndex); i += 1) {
      const square = line[i];
      if (square) mustBeEmpty.push(square);
    }

    const kingPath: Coord[] = [];
    for (let step = 1; step <= 2; step += 1) {
      const square = line[kingIndex + step * direction];
      if (square) kingPath.push(square);
    }

    plans.push({ side, kingFrom, kingTo, rookFrom, rookTo, mustBeEmpty, kingPath });
  }
  return plans;
}

// --------------------------------------------------------------------------
// Debug helpers
// --------------------------------------------------------------------------

const TAGS: Readonly<Record<PlayerColor, string>> = {
  red: 'R',
  blue: 'B',
  yellow: 'Y',
  green: 'G',
};

/** Human-readable dump used by test failure messages. */
export function boardToAscii(board: Board): string {
  const rows: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const index = r * BOARD_SIZE + c;
      if (!isPlayableIndex(index)) {
        cells.push('  ');
        continue;
      }
      const piece = board[index];
      cells.push(piece ? `${TAGS[piece.owner]}${piece.type}` : ' .');
    }
    rows.push(`${String(BOARD_SIZE - r).padStart(2)} ${cells.join(' ')}`);
  }
  return rows.join('\n');
}

export function describeSquare(board: Board, coord: Coord): string {
  const piece = pieceAt(board, coord);
  return piece ? `${toNotation(coord)}=${TAGS[piece.owner]}${piece.type}` : `${toNotation(coord)}=empty`;
}

export function pieceTypeCounts(board: Board, owner: PlayerColor): Readonly<Record<PieceType, number>> {
  const counts: Record<PieceType, number> = { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0 };
  for (const { piece } of piecesOf(board, owner)) {
    counts[piece.type] += 1;
  }
  return counts;
}
