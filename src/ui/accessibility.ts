/**
 * Accessibility helpers (architecture.md §9).
 *
 * Two jobs: build the text a screen reader hears for any square, and own the
 * live regions that announce moves, checks, eliminations and results.
 */

import { toNotation, type Coord } from '../engine/coordinates.js';
import { COLOR_NAMES, PIECE_NAMES, type Piece, type PlayerColor } from '../engine/pieces.js';
import type { GameResult } from '../engine/elimination.js';
import type { GameEvent } from '../engine/gameState.js';
import { describeMove } from '../engine/notation.js';

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
const ZERO_WIDTH_SPACE = '\u200B';

/**
 * Strips control characters from untrusted text (imported player names, for
 * example). It is NOT an HTML escaper: every dynamic string is written with
 * `textContent`, so markup can never be introduced in the first place.
 */
export function escapeText(value: unknown): string {
  return String(value ?? '').replace(CONTROL_CHARS, '');
}

export interface SquareState {
  readonly piece: Piece | null;
  readonly isSelected: boolean;
  readonly isLegalTarget: boolean;
  readonly isCapture: boolean;
  readonly isLastMove: boolean;
  readonly isCheckedKing: boolean;
}

/** e.g. "n8, Red king, in check" or "h4, empty, legal move". */
export function describeSquare(coord: Coord, square: SquareState): string {
  const parts: string[] = [toNotation(coord)];

  if (square.piece) {
    const { piece } = square;
    const dead = piece.dead ? 'eliminated ' : '';
    parts.push(`${dead}${COLOR_NAMES[piece.owner]} ${PIECE_NAMES[piece.type]}`);
  } else {
    parts.push('empty');
  }

  if (square.isCheckedKing) parts.push('in check');
  if (square.isSelected) parts.push('selected');
  if (square.isLegalTarget) parts.push(square.isCapture ? 'legal capture' : 'legal move');
  if (square.isLastMove) parts.push('last move');

  return parts.join(', ');
}

export function describeResult(result: GameResult): string {
  if (result.kind === 'draw') return `Game drawn. ${result.detail}`;
  return `Game over. ${result.detail}`;
}

/** Turns engine events into one sentence for the live region. */
export function describeEvents(events: readonly GameEvent[]): string {
  const sentences: string[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'move':
        sentences.push(`${COLOR_NAMES[event.color]} ${describeMove(event.move)}.`);
        break;
      case 'promotion':
        sentences.push(`${COLOR_NAMES[event.color]} promotes to ${PIECE_NAMES[event.to]}.`);
        break;
      case 'check':
        sentences.push(
          `${COLOR_NAMES[event.color]} is in check from ${event.by.map((c) => COLOR_NAMES[c]).join(' and ')}.`,
        );
        break;
      case 'checkmate':
        sentences.push(`${COLOR_NAMES[event.color]} is checkmated.`);
        break;
      case 'stalemate':
        sentences.push(`${COLOR_NAMES[event.color]} is stalemated.`);
        break;
      case 'skip':
        sentences.push(`${COLOR_NAMES[event.color]} has no legal move and is skipped.`);
        break;
      case 'elimination':
        sentences.push(`${COLOR_NAMES[event.color]} is eliminated by ${event.reason}.`);
        break;
      case 'gameEnd':
        sentences.push(describeResult(event.result));
        break;
      case 'capture':
      case 'score':
        break;
    }
  }

  return sentences.join(' ');
}

export function describeTurn(color: PlayerColor, inCheck: boolean): string {
  return inCheck ? `${COLOR_NAMES[color]} to move, in check.` : `${COLOR_NAMES[color]} to move.`;
}

/**
 * Owns the polite and assertive live regions. Repeating identical text is
 * nudged with a zero-width space so screen readers re-announce it.
 */
export class Announcer {
  #polite: HTMLElement;
  #assertive: HTMLElement;
  #last = '';

  constructor(polite: HTMLElement, assertive: HTMLElement) {
    this.#polite = polite;
    this.#assertive = assertive;
  }

  say(text: string): void {
    const clean = escapeText(text).trim();
    if (!clean) return;
    this.#polite.textContent = clean === this.#last ? `${clean}${ZERO_WIDTH_SPACE}` : clean;
    this.#last = clean;
  }

  alert(text: string): void {
    this.#assertive.textContent = escapeText(text).trim();
  }

  clearAlert(): void {
    this.#assertive.textContent = '';
  }
}

/** True when the viewer asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}
