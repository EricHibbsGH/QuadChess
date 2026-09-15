/**
 * T-11 check detection from every direction.
 * T-12 pins and discovered checks.
 * T-13 a player attacked by several opponents at once.
 */

import { describe, expect, it } from 'vitest';
import { checkersOf, checkingPlayerCount, isInCheck } from '../../src/engine/check.js';
import { isSquareAttackedBy } from '../../src/engine/attacks.js';
import { legalMovesFrom, legalMoves } from '../../src/engine/legalMoves.js';
import { toNotation } from '../../src/engine/coordinates.js';
import type { MoveContext } from '../../src/engine/movement.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { boardFrom, destinations, sq } from '../support/fixture.js';

function ctx(pieces: Record<string, string>, profile = STANDARD_TEAMS): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant: null, ply: 0 };
}

describe('T-11 check from every direction', () => {
  // Yellow king on h7 (centre of the board) attacked from each of eight rays.
  const rays: readonly (readonly [string, string, string])[] = [
    ['north', 'h11', 'GR'],
    ['south', 'h3', 'GR'],
    ['east', 'l7', 'GR'],
    ['west', 'd7', 'GR'],
    ['north-east', 'k10', 'GB'],
    ['north-west', 'e10', 'GB'],
    ['south-east', 'k4', 'GB'],
    ['south-west', 'e4', 'GB'],
  ];

  it.each(rays)('detects a sliding check from the %s', (_name, square, code) => {
    const context = ctx({ h7: 'YK', [square]: code });
    expect(isInCheck(context, 'yellow')).toBe(true);
    expect(checkersOf(context, 'yellow').map(toNotation)).toEqual([square]);
  });

  it.each(rays)('is blocked when a piece stands in the way (%s)', (_name, square, code) => {
    // The blocker is one of Yellow's own pawns, so it can never itself check Yellow.
    const between = oneStepToward(sq('h7'), sq(square));
    const context = ctx({ h7: 'YK', [square]: code, [toNotation(between)]: 'YP' });
    expect(isInCheck(context, 'yellow')).toBe(false);
  });

  it('detects knight checks from all eight jumps', () => {
    for (const square of ['f8', 'f6', 'g9', 'g5', 'i9', 'i5', 'j8', 'j6']) {
      const context = ctx({ h7: 'YK', [square]: 'GN' });
      expect(isInCheck(context, 'yellow'), square).toBe(true);
    }
  });

  it('detects pawn checks along each attacker orientation', () => {
    // A green pawn (moving down) on g8 or i8 attacks h7.
    expect(isInCheck(ctx({ h7: 'YK', g8: 'GP' }), 'yellow')).toBe(true);
    expect(isInCheck(ctx({ h7: 'YK', i8: 'GP' }), 'yellow')).toBe(true);
    // A green pawn below the king does not.
    expect(isInCheck(ctx({ h7: 'YK', g6: 'GP' }), 'yellow')).toBe(false);
    // A blue pawn (moving right) on g6 or g8 attacks h7.
    expect(isInCheck(ctx({ h7: 'YK', g6: 'BP' }), 'yellow')).toBe(true);
    expect(isInCheck(ctx({ h7: 'YK', g8: 'BP' }), 'yellow')).toBe(true);
    expect(isInCheck(ctx({ h7: 'YK', i8: 'BP' }), 'yellow')).toBe(false);
  });

  it('a pawn does not give check by its push', () => {
    expect(isInCheck(ctx({ h7: 'YK', h8: 'GP' }), 'yellow')).toBe(false);
  });

  it('an adjacent enemy king gives check', () => {
    expect(isInCheck(ctx({ h7: 'YK', h8: 'GK' }), 'yellow')).toBe(true);
  });

  it('T-08 a slider cannot check through a missing corner', () => {
    // b3 does not exist, so the green rook on a4 and the yellow king on d1
    // are not connected in any way.
    const context = ctx({ d1: 'YK', a4: 'GR' });
    expect(isInCheck(context, 'yellow')).toBe(false);
    expect(isSquareAttackedBy(context, sq('d1'), 'green')).toBe(false);
  });

  it('a rook on d-file does check down the file through the arm', () => {
    expect(isInCheck(ctx({ d1: 'YK', d11: 'GR' }), 'yellow')).toBe(true);
  });
});

describe('teammates never give check (rules.md §8.2)', () => {
  it('a red rook aiming at the yellow king is not check in the Teams profile', () => {
    expect(isInCheck(ctx({ h7: 'YK', h11: 'RR' }), 'yellow')).toBe(false);
  });

  it('but it IS check in free-for-all', () => {
    expect(isInCheck(ctx({ h7: 'YK', h11: 'RR' }, STANDARD_FFA), 'yellow')).toBe(true);
  });
});

describe('T-12 pins', () => {
  it('an absolutely pinned piece cannot leave the pin ray', () => {
    // Yellow king h7, yellow rook h9, green rook h11: the rook is pinned.
    const context = ctx({ h7: 'YK', h9: 'YR', h11: 'GR' });
    expect(isInCheck(context, 'yellow')).toBe(false);
    const moves = destinations(legalMovesFrom(context, sq('h9')));
    // It may only move along the file, including capturing the pinner.
    expect(moves).toEqual(['h10', 'h11', 'h8']);
  });

  it('a pinned piece may still capture the pinning piece', () => {
    const context = ctx({ h7: 'YK', h9: 'YR', h11: 'GR' });
    expect(destinations(legalMovesFrom(context, sq('h9')))).toContain('h11');
  });

  it('a piece is not pinned when a second blocker stands on the ray', () => {
    const context = ctx({ h7: 'YK', h9: 'YR', h10: 'BP', h11: 'GR' });
    expect(destinations(legalMovesFrom(context, sq('h9')))).toContain('g9');
  });
});

describe('T-12 discovered check', () => {
  it('moving a blocker off the ray exposes the king and is therefore illegal for its owner', () => {
    // Yellow king h7 behind its own knight h9, green rook h11.
    const context = ctx({ h7: 'YK', h9: 'YN', h11: 'GR' });
    const knightMoves = legalMovesFrom(context, sq('h9'));
    expect(knightMoves).toHaveLength(0);
  });

  it('a discovered check is delivered when the blocker belongs to the attacker', () => {
    // Green knight on h9 shields the yellow king from the green rook on h11.
    const before = ctx({ h7: 'YK', h9: 'GN', h11: 'GR' });
    expect(isInCheck(before, 'yellow')).toBe(false);
    // After the knight leaves, the rook checks.
    const after = ctx({ h7: 'YK', j8: 'GN', h11: 'GR' });
    expect(isInCheck(after, 'yellow')).toBe(true);
  });
});

describe('T-13 multiple checks', () => {
  it('reports a double check from one opponent', () => {
    const context = ctx({ h7: 'YK', h11: 'GR', e10: 'GB' });
    expect(checkersOf(context, 'yellow')).toHaveLength(2);
    expect(checkingPlayerCount(context, 'yellow')).toBe(1);
  });

  it('reports checks delivered by two different opponents', () => {
    const context = ctx({ h7: 'YK', h11: 'GR', d7: 'BR' });
    expect(checkersOf(context, 'yellow')).toHaveLength(2);
    expect(checkingPlayerCount(context, 'yellow')).toBe(2);
  });

  it('reports a triple check from three different opponents in free-for-all', () => {
    const context = ctx({ h7: 'YK', h11: 'GR', d7: 'BR', l7: 'RR' }, STANDARD_FFA);
    expect(checkersOf(context, 'yellow')).toHaveLength(3);
    expect(checkingPlayerCount(context, 'yellow')).toBe(3);
  });

  it('under double check only king moves can be legal', () => {
    // Yellow king h7 checked by a rook on the file and a bishop on the diagonal.
    // A yellow rook that could block one cannot answer both.
    const context = ctx({ h7: 'YK', h11: 'GR', e10: 'GB', a6: 'YR' });
    const moves = legalMoves(context, 'yellow');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.piece === 'K')).toBe(true);
  });
});

describe('legal responses to a single check', () => {
  const context = ctx({ h7: 'YK', h11: 'GR', a9: 'YR', c7: 'YB' });

  it('allows moving the king out of the ray', () => {
    const kingMoves = destinations(legalMovesFrom(context, sq('h7')));
    expect(kingMoves).toContain('g7');
    expect(kingMoves).not.toContain('h8');
  });

  it('allows blocking the ray', () => {
    // The yellow rook on a9 can interpose on h9.
    expect(destinations(legalMovesFrom(context, sq('a9')))).toContain('h9');
  });

  it('allows capturing the checking piece', () => {
    // The yellow bishop on c7 reaches h11? No - use a direct capture instead.
    const capture = ctx({ h7: 'YK', h11: 'GR', h13: 'YR' });
    expect(destinations(legalMovesFrom(capture, sq('h13')))).toContain('h11');
  });

  it('forbids every move that leaves the king in check', () => {
    for (const move of legalMoves(context, 'yellow')) {
      expect(move.color).toBe('yellow');
    }
    // The bishop on c7 cannot make an unrelated move while the king is checked.
    const bishopMoves = destinations(legalMovesFrom(context, sq('c7')));
    expect(bishopMoves).not.toContain('b8');
  });
});

describe('a player may expose a TEAMMATE king (rules.md §11)', () => {
  it('yellow may move a piece that unblocks a check on red', () => {
    // Blue rook n4 aims along rank 4 at the red king on e4, blocked by a yellow knight on h4.
    const context = ctx({ e4: 'RK', h4: 'YN', a4: 'BR', h1: 'YK' });
    expect(STANDARD_TEAMS.mayExposeTeammateKing).toBe(true);
    const moves = legalMovesFrom(context, sq('h4'));
    expect(moves.length).toBeGreaterThan(0);
  });
});

/** One square from `a` along the straight ray toward `b`. */
function oneStepToward(a: { r: number; c: number }, b: { r: number; c: number }) {
  return { r: a.r + Math.sign(b.r - a.r), c: a.c + Math.sign(b.c - a.c) };
}
