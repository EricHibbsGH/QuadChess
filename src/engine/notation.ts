/**
 * Move notation (rules.md §5 of architecture.md).
 *
 * Long algebraic is used deliberately: with 64 pieces in four colours, short
 * SAN disambiguation is unreadable, and always writing the origin square makes
 * the text round-trip without needing board context.
 *
 *   Nn5-l6      quiet move          m8-l8        pawn push
 *   Rn11xk11    capture             m8xl7        pawn capture
 *   b10-b11=Q   promotion           d2xc3 e.p.   en passant
 *   O-O / O-O-O castling            suffix + / # check / checkmate
 */

import { fromNotation, toNotation, type Coord } from './coordinates.js';
import { COLOR_TAGS, type PieceType, type PlayerColor } from './pieces.js';
import type { Move } from './movement.js';
import type { CastleSide } from './board.js';

export interface ParsedMove {
  readonly from: Coord | null;
  readonly to: Coord | null;
  readonly promotion: PieceType | null;
  readonly castle: CastleSide | null;
  readonly capture: boolean;
  readonly enPassant: boolean;
}

const MOVE_PATTERN =
  /^([KQRBN])?([a-n](?:1[0-4]|[1-9]))([-x])([a-n](?:1[0-4]|[1-9]))(?:=([QRBN]))?(\s*e\.p\.)?[+#]?$/;

export function moveToText(move: Move): string {
  if (move.castle) return move.castle === 'short' ? 'O-O' : 'O-O-O';

  const prefix = move.piece === 'P' ? '' : move.piece;
  const separator = move.capture ? 'x' : '-';
  const promotion = move.promotion ? `=${move.promotion}` : '';
  const ep = move.enPassant ? ' e.p.' : '';
  return `${prefix}${toNotation(move.from)}${separator}${toNotation(move.to)}${promotion}${ep}`;
}

export interface Decoration {
  readonly check?: boolean;
  readonly checkmate?: boolean;
}

export function decorateText(text: string, decoration: Decoration): string {
  if (decoration.checkmate) return `${text}#`;
  if (decoration.check) return `${text}+`;
  return text;
}

/** `R:Nn5-l6` — the colour-tagged form used in the move list and in exports. */
export function formatPly(color: PlayerColor, text: string): string {
  return `${COLOR_TAGS[color]}:${text}`;
}

export function parseMoveText(text: unknown): ParsedMove | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();

  if (/^O-O-O[+#]?$/i.test(trimmed)) {
    return { from: null, to: null, promotion: null, castle: 'long', capture: false, enPassant: false };
  }
  if (/^O-O[+#]?$/i.test(trimmed)) {
    return { from: null, to: null, promotion: null, castle: 'short', capture: false, enPassant: false };
  }

  const match = MOVE_PATTERN.exec(trimmed);
  if (!match) return null;

  const from = fromNotation(match[2] ?? '');
  const to = fromNotation(match[4] ?? '');
  if (!from || !to) return null;

  const promotionText = match[5];
  return {
    from,
    to,
    promotion: (promotionText as PieceType | undefined) ?? null,
    castle: null,
    capture: match[3] === 'x',
    enPassant: Boolean(match[6]),
  };
}

/** Human-readable description used for screen-reader announcements. */
export function describeMove(move: Move): string {
  if (move.castle) {
    return move.castle === 'short' ? 'castles short' : 'castles long';
  }
  const names: Record<PieceType, string> = {
    K: 'king',
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight',
    P: 'pawn',
  };
  const action = move.capture ? 'captures on' : 'to';
  const target = move.capture
    ? `${toNotation(move.to)}, taking ${names[move.capture.type]}`
    : toNotation(move.to);
  const promotion = move.promotion ? `, promoting to ${names[move.promotion]}` : '';
  const ep = move.enPassant ? ' en passant' : '';
  return `${names[move.piece]} ${toNotation(move.from)} ${action} ${target}${ep}${promotion}`;
}
