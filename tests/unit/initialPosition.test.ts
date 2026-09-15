/**
 * T-03 — the initial position of all 64 pieces (rules.md §4.2).
 * T-04 — turn order.
 */

import { describe, expect, it } from 'vitest';
import { allPieces, castlePlans, initialBoard, pieceAt, pieceTypeCounts, piecesOf } from '../../src/engine/board.js';
import { isPlayable, toNotation, type Coord } from '../../src/engine/coordinates.js';
import { createGame } from '../../src/engine/gameState.js';
import { STANDARD_TEAMS, STANDARD_TEAMS_CLASSIC } from '../../src/rules/teams.js';
import { STANDARD_FFA } from '../../src/rules/freeForAll.js';
import type { PlayerColor } from '../../src/engine/pieces.js';

const EXPECTED: Readonly<Record<PlayerColor, Readonly<Record<string, string>>>> = {
  red: {
    n11: 'R', n10: 'N', n9: 'B', n8: 'K', n7: 'Q', n6: 'B', n5: 'N', n4: 'R',
    m4: 'P', m5: 'P', m6: 'P', m7: 'P', m8: 'P', m9: 'P', m10: 'P', m11: 'P',
  },
  blue: {
    a11: 'R', a10: 'N', a9: 'B', a8: 'Q', a7: 'K', a6: 'B', a5: 'N', a4: 'R',
    b4: 'P', b5: 'P', b6: 'P', b7: 'P', b8: 'P', b9: 'P', b10: 'P', b11: 'P',
  },
  yellow: {
    d1: 'R', e1: 'N', f1: 'B', g1: 'Q', h1: 'K', i1: 'B', j1: 'N', k1: 'R',
    d2: 'P', e2: 'P', f2: 'P', g2: 'P', h2: 'P', i2: 'P', j2: 'P', k2: 'P',
  },
  green: {
    d14: 'R', e14: 'N', f14: 'B', g14: 'K', h14: 'Q', i14: 'B', j14: 'N', k14: 'R',
    d13: 'P', e13: 'P', f13: 'P', g13: 'P', h13: 'P', i13: 'P', j13: 'P', k13: 'P',
  },
};

describe('T-03 initial placement', () => {
  const board = initialBoard(STANDARD_TEAMS);

  it('places exactly 64 pieces, 16 per army', () => {
    expect(allPieces(board)).toHaveLength(64);
    for (const color of STANDARD_TEAMS.turnOrder) {
      expect(piecesOf(board, color), color).toHaveLength(16);
    }
  });

  it('gives every army 8 pawns and the standard 8 major and minor pieces', () => {
    for (const color of STANDARD_TEAMS.turnOrder) {
      expect(pieceTypeCounts(board, color), color).toEqual({ K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8 });
    }
  });

  it.each(Object.entries(EXPECTED))('places every %s piece on its documented square', (color, squares) => {
    for (const [notation, type] of Object.entries(squares)) {
      const coord = squareOf(notation);
      const piece = pieceAt(board, coord);
      expect(piece, `${color} expected ${type} on ${notation}`).not.toBeNull();
      expect(piece?.type).toBe(type);
      expect(piece?.owner).toBe(color);
      expect(piece?.hasMoved).toBe(false);
      expect(piece?.dead).toBe(false);
    }
  });

  it('occupies no square outside the documented set', () => {
    const expectedSquares = new Set(
      Object.values(EXPECTED).flatMap((squares) => Object.keys(squares)),
    );
    expect(expectedSquares.size).toBe(64);
    for (const { coord } of allPieces(board)) {
      expect(expectedSquares.has(toNotation(coord))).toBe(true);
    }
  });

  it('INV-1: no piece stands on an unplayable coordinate', () => {
    for (const { coord } of allPieces(board)) {
      expect(isPlayable(coord.r, coord.c), toNotation(coord)).toBe(true);
    }
  });

  it('places the four kings on n8, a7, h1 and g14', () => {
    expect(toNotation(kingOf('red'))).toBe('n8');
    expect(toNotation(kingOf('blue'))).toBe('a7');
    expect(toNotation(kingOf('yellow'))).toBe('h1');
    expect(toNotation(kingOf('green'))).toBe('g14');
  });

  it('is exactly 90-degree rotationally symmetric', () => {
    // (r, c) -> (c, 13 - r) maps yellow -> blue -> green -> red.
    const chain: readonly (readonly [PlayerColor, PlayerColor])[] = [
      ['yellow', 'blue'],
      ['blue', 'green'],
      ['green', 'red'],
      ['red', 'yellow'],
    ];
    for (const [from, to] of chain) {
      const rotated = piecesOf(board, from)
        .map(({ coord, piece }) => `${coord.c},${13 - coord.r}:${piece.type}`)
        .sort();
      const target = piecesOf(board, to)
        .map(({ coord, piece }) => `${coord.r},${coord.c}:${piece.type}`)
        .sort();
      expect(rotated, `${from} rotated onto ${to}`).toEqual(target);
    }
  });

  function kingOf(color: PlayerColor): Coord {
    const found = piecesOf(board, color).find(({ piece }) => piece.type === 'K');
    if (!found) throw new Error(`no ${color} king`);
    return found.coord;
  }
});

describe('classic seating variant', () => {
  it('seats teammates opposite one another', () => {
    expect(STANDARD_TEAMS_CLASSIC.seating).toEqual({
      red: 'bottom',
      blue: 'left',
      yellow: 'top',
      green: 'right',
    });
  });

  it('still produces 64 pieces on playable squares', () => {
    const board = initialBoard(STANDARD_TEAMS_CLASSIC);
    expect(allPieces(board)).toHaveLength(64);
    for (const { coord } of allPieces(board)) {
      expect(isPlayable(coord.r, coord.c)).toBe(true);
    }
  });
});

describe('T-04 turn order', () => {
  it('starts with Red and rotates Red, Blue, Yellow, Green', () => {
    for (const profile of [STANDARD_TEAMS, STANDARD_FFA]) {
      expect(profile.turnOrder).toEqual(['red', 'blue', 'yellow', 'green']);
      expect(createGame(profile).toMove).toBe('red');
      expect(createGame(profile).active).toEqual(['red', 'blue', 'yellow', 'green']);
    }
  });

  it('alternates teams in the Teams profile', () => {
    const teamOf = (color: PlayerColor) =>
      STANDARD_TEAMS.teams?.findIndex((team) => team.includes(color)) ?? -1;
    const sequence = STANDARD_TEAMS.turnOrder.map(teamOf);
    expect(sequence).toEqual([0, 1, 0, 1]);
  });

  it('pairs Red with Yellow and Blue with Green', () => {
    expect(STANDARD_TEAMS.teams).toEqual([
      ['red', 'yellow'],
      ['blue', 'green'],
    ]);
    expect(STANDARD_FFA.teams).toBeNull();
  });
});

describe('T-05c castling geometry (rules.md §7)', () => {
  const expected: Readonly<Record<PlayerColor, Readonly<Record<string, string>>>> = {
    yellow: { short: 'h1>j1 rook k1>i1', long: 'h1>f1 rook d1>g1' },
    blue: { short: 'a7>a5 rook a4>a6', long: 'a7>a9 rook a11>a8' },
    green: { short: 'g14>e14 rook d14>f14', long: 'g14>i14 rook k14>h14' },
    red: { short: 'n8>n10 rook n11>n9', long: 'n8>n6 rook n4>n7' },
  };

  it.each(Object.entries(expected))('derives both plans for %s', (color, sides) => {
    const plans = castlePlans(STANDARD_TEAMS, color as PlayerColor);
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const text = `${toNotation(plan.kingFrom)}>${toNotation(plan.kingTo)} rook ${toNotation(plan.rookFrom)}>${toNotation(plan.rookTo)}`;
      expect(text).toBe(sides[plan.side]);
      expect(plan.kingPath).toHaveLength(2);
      expect(plan.mustBeEmpty).toHaveLength(plan.side === 'short' ? 2 : 3);
      for (const coord of [...plan.kingPath, ...plan.mustBeEmpty, plan.kingTo, plan.rookTo]) {
        expect(isPlayable(coord.r, coord.c), toNotation(coord)).toBe(true);
      }
    }
  });
});

function squareOf(notation: string): Coord {
  const file = 'abcdefghijklmn'.indexOf(notation[0] ?? '');
  const rank = Number.parseInt(notation.slice(1), 10);
  return { r: 14 - rank, c: file };
}
