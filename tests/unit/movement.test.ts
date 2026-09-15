/**
 * T-05 piece movement, T-07/T-08 corner interaction, T-09 captures and blocking.
 *
 * Expected destination sets were computed from an independent model of the board
 * (see testing.md), not read back out of the engine.
 */

import { describe, expect, it } from 'vitest';
import { pseudoLegalMovesFrom, attackSquaresFrom, type MoveContext } from '../../src/engine/movement.js';
import { legalMovesFrom } from '../../src/engine/legalMoves.js';
import { toNotation } from '../../src/engine/coordinates.js';
import { STANDARD_TEAMS } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import { boardFrom, destinations, sq } from '../support/fixture.js';

function ctx(pieces: Record<string, string>, profile = STANDARD_TEAMS): MoveContext {
  return { board: boardFrom(pieces), profile, enPassant: null, ply: 0 };
}

function movesFrom(pieces: Record<string, string>, from: string, profile = STANDARD_TEAMS) {
  return destinations(pseudoLegalMovesFrom(ctx(pieces, profile), sq(from)));
}

describe('T-05a rook movement across the cross', () => {
  it('slides along rank and file and stops at missing corners', () => {
    expect(movesFrom({ a4: 'BR' }, 'a4')).toEqual(
      ['a10', 'a11', 'a5', 'a6', 'a7', 'a8', 'a9', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4', 'i4', 'j4', 'k4', 'l4', 'm4', 'n4'].sort(),
    );
  });

  it('T-08 cannot slide into the corner below a4', () => {
    expect(movesFrom({ a4: 'BR' }, 'a4')).not.toContain('a3');
  });

  it('T-08 a rook on d3 cannot slide left through the bottom-left corner', () => {
    const moves = movesFrom({ d3: 'YR' }, 'd3');
    expect(moves).not.toContain('c3');
    expect(moves).not.toContain('b3');
    expect(moves).toEqual(
      ['d1', 'd10', 'd11', 'd12', 'd13', 'd14', 'd2', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'e3', 'f3', 'g3', 'h3', 'i3', 'j3', 'k3'].sort(),
    );
  });
});

describe('T-05b bishop movement across the cross', () => {
  it('slides diagonally and stops where the corner removes the next square', () => {
    expect(movesFrom({ d12: 'GB' }, 'd12')).toEqual(
      ['a9', 'b10', 'c11', 'e11', 'e13', 'f10', 'f14', 'g9', 'h8', 'i7', 'j6', 'k5', 'l4'].sort(),
    );
  });

  it('T-08 the up-left diagonal from d12 is blocked immediately by c13', () => {
    expect(movesFrom({ d12: 'GB' }, 'd12')).not.toContain('c13');
  });

  it('crosses freely between an arm and the central band', () => {
    expect(movesFrom({ g7: 'YB' }, 'g7')).toEqual(
      ['c11', 'd10', 'd4', 'e5', 'e9', 'f6', 'f8', 'h6', 'h8', 'i5', 'i9', 'j10', 'j4', 'k11', 'k3'].sort(),
    );
  });
});

describe('T-05d queen movement', () => {
  it('combines rook and bishop rays and respects every corner', () => {
    const moves = movesFrom({ d3: 'YQ' }, 'd3');
    expect(moves).toEqual(
      ['a6', 'b5', 'c4', 'd1', 'd10', 'd11', 'd12', 'd13', 'd14', 'd2', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'e2', 'e3', 'e4', 'f1', 'f3', 'f5', 'g3', 'g6', 'h3', 'h7', 'i3', 'i8', 'j3', 'j9', 'k10', 'k3', 'l11'].sort(),
    );
    expect(moves).not.toContain('c2');
    expect(moves).not.toContain('c3');
  });
});

describe('T-05c knight movement', () => {
  it('T-07 leaps over the corner region when the destination is playable', () => {
    expect(movesFrom({ d3: 'YN' }, 'd3')).toEqual(['b4', 'c5', 'e1', 'e5', 'f2', 'f4']);
  });

  it('T-07 never lands inside a corner block', () => {
    const moves = movesFrom({ d3: 'YN' }, 'd3');
    for (const corner of ['b2', 'c1', 'b1', 'c2']) {
      expect(moves).not.toContain(corner);
    }
  });

  it('is heavily restricted on the outer edge of an arm', () => {
    expect(movesFrom({ a4: 'BN' }, 'a4')).toEqual(['b6', 'c5']);
  });
});

describe('T-05e king movement', () => {
  it('steps one square in eight directions, minus missing corners', () => {
    expect(movesFrom({ a4: 'BK' }, 'a4')).toEqual(['a5', 'b4', 'b5']);
    expect(movesFrom({ d3: 'YK' }, 'd3')).toEqual(['c4', 'd2', 'd4', 'e2', 'e3', 'e4']);
  });
});

describe('T-09 captures, friendly blocking and teammate blocking', () => {
  it('captures an opponent and stops the ray there', () => {
    const moves = movesFrom({ g7: 'YR', g10: 'GP' }, 'g7');
    expect(moves).toContain('g10');
    expect(moves).not.toContain('g11');
  });

  it('is blocked by its own piece without capturing it', () => {
    const moves = movesFrom({ g7: 'YR', g10: 'YP' }, 'g7');
    expect(moves).not.toContain('g10');
    expect(moves).toContain('g9');
  });

  it('T-10 cannot capture or pass through a teammate in the Teams profile', () => {
    // Yellow and Red are teammates in standard-teams.
    const moves = movesFrom({ g7: 'YR', g10: 'RP' }, 'g7');
    expect(moves).not.toContain('g10');
    expect(moves).not.toContain('g11');
    expect(moves).toContain('g9');
  });

  it('T-10 the same piece IS capturable in free-for-all', () => {
    const moves = movesFrom({ g7: 'YR', g10: 'RP' }, 'g7', STANDARD_FFA);
    expect(moves).toContain('g10');
    expect(moves).not.toContain('g11');
  });

  it('never generates a move onto an enemy king while king capture is off', () => {
    expect(STANDARD_TEAMS.kingCaptureAllowed).toBe(false);
    const moves = movesFrom({ g7: 'YR', g10: 'GK' }, 'g7');
    expect(moves).not.toContain('g10');
    expect(moves).toContain('g9');
  });
});

describe('dead pieces (AMB-8)', () => {
  const pieces = { g7: 'YR', g10: 'GPd' };

  it('block sliding pieces', () => {
    expect(movesFrom(pieces, 'g7', STANDARD_FFA)).not.toContain('g11');
  });

  it('can be captured for points when the profile allows it', () => {
    expect(STANDARD_FFA.deadPiecesCapturable).toBe(true);
    expect(movesFrom(pieces, 'g7', STANDARD_FFA)).toContain('g10');
  });

  it('cannot move themselves', () => {
    expect(movesFrom({ g10: 'GRd' }, 'g10', STANDARD_FFA)).toEqual([]);
  });

  it('do not attack', () => {
    const context = ctx({ g10: 'GRd' }, STANDARD_FFA);
    expect(attackSquaresFrom(context, sq('g10'))).toEqual([]);
  });
});

describe('attack squares agree with generated moves', () => {
  it('a rook attacks exactly the squares it can reach, plus blocked occupied squares', () => {
    const pieces = { g7: 'YR', g10: 'YP', d7: 'GP' };
    const context = ctx(pieces);
    const attacked = new Set(attackSquaresFrom(context, sq('g7')).map(toNotation));
    // It cannot move onto its own pawn, but it does defend that square.
    expect(attacked.has('g10')).toBe(true);
    expect(destinations(pseudoLegalMovesFrom(context, sq('g7')))).not.toContain('g10');
    // It attacks and can capture the green pawn.
    expect(attacked.has('d7')).toBe(true);
    expect(destinations(pseudoLegalMovesFrom(context, sq('g7')))).toContain('d7');
    // Nothing beyond a blocker is attacked.
    expect(attacked.has('c7')).toBe(false);
  });
});

describe('legal move generation refuses to move a piece that is not there', () => {
  it('returns an empty list for an empty square', () => {
    expect(legalMovesFrom(ctx({}), sq('g7'))).toEqual([]);
  });
});
