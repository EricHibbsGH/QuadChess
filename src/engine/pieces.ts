/**
 * Piece and player primitives. Deliberately free of any rule decision: which
 * colour sits where, which colours are allied, and what a piece is worth all
 * live in `src/rules`.
 */

export type PlayerColor = 'red' | 'blue' | 'yellow' | 'green';

export const PLAYER_COLORS: readonly PlayerColor[] = Object.freeze([
  'red',
  'blue',
  'yellow',
  'green',
]);

export function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === 'string' && (PLAYER_COLORS as readonly string[]).includes(value);
}

export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

export const PIECE_TYPES: readonly PieceType[] = Object.freeze(['K', 'Q', 'R', 'B', 'N', 'P']);

export function isPieceType(value: unknown): value is PieceType {
  return typeof value === 'string' && (PIECE_TYPES as readonly string[]).includes(value);
}

export interface Piece {
  readonly type: PieceType;
  readonly owner: PlayerColor;
  /** Castling rights and pawn double-step eligibility both derive from this. */
  readonly hasMoved: boolean;
  /** True once the owner is eliminated under `eliminatedPieceBehavior: remainAsDead`. */
  readonly dead: boolean;
}

export function makePiece(
  type: PieceType,
  owner: PlayerColor,
  options: { hasMoved?: boolean; dead?: boolean } = {},
): Piece {
  return Object.freeze({
    type,
    owner,
    hasMoved: options.hasMoved ?? false,
    dead: options.dead ?? false,
  });
}

export function withMoved(piece: Piece): Piece {
  return piece.hasMoved ? piece : makePiece(piece.type, piece.owner, { hasMoved: true, dead: piece.dead });
}

export function asDead(piece: Piece): Piece {
  return piece.dead ? piece : makePiece(piece.type, piece.owner, { hasMoved: piece.hasMoved, dead: true });
}

export function promoteTo(piece: Piece, type: PieceType): Piece {
  return makePiece(type, piece.owner, { hasMoved: true, dead: piece.dead });
}

export function piecesEqual(a: Piece | null, b: Piece | null): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.owner === b.owner && a.hasMoved === b.hasMoved && a.dead === b.dead;
}

export const PIECE_NAMES: Readonly<Record<PieceType, string>> = Object.freeze({
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
});

export const COLOR_NAMES: Readonly<Record<PlayerColor, string>> = Object.freeze({
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
  green: 'Green',
});

/** Single-letter tag used in notation and as a non-colour ownership cue in the UI. */
export const COLOR_TAGS: Readonly<Record<PlayerColor, string>> = Object.freeze({
  red: 'R',
  blue: 'B',
  yellow: 'Y',
  green: 'G',
});

export const SLIDING_TYPES: readonly PieceType[] = Object.freeze(['Q', 'R', 'B']);

export function isSliding(type: PieceType): boolean {
  return type === 'Q' || type === 'R' || type === 'B';
}
