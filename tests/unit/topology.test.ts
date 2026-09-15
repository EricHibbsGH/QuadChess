/**
 * T-01 / T-02 — board topology.
 * Rule under test: the board is 14x14 with four 3x3 corner blocks removed,
 * leaving exactly 160 playable squares (rules.md §1).
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  CELL_COUNT,
  CORNER_SIZE,
  PLAYABLE_COUNT,
  allPlayableCoords,
  isInBounds,
  isPlayable,
  regionOf,
} from '../../src/engine/coordinates.js';

describe('T-01 playable square count', () => {
  it('has exactly 160 playable squares', () => {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (isPlayable(r, c)) count += 1;
      }
    }
    expect(count).toBe(160);
    expect(PLAYABLE_COUNT).toBe(160);
    expect(allPlayableCoords()).toHaveLength(160);
  });

  it('accounts for every cell: 196 total = 160 playable + 36 excluded', () => {
    expect(CELL_COUNT).toBe(196);
    expect(CELL_COUNT - 160).toBe(36);
  });

  it('rows 3..10 are fully playable and the arm rows have 8 squares each', () => {
    const widths = Array.from({ length: BOARD_SIZE }, (_, r) => {
      let count = 0;
      for (let c = 0; c < BOARD_SIZE; c += 1) if (isPlayable(r, c)) count += 1;
      return count;
    });
    expect(widths).toEqual([8, 8, 8, 14, 14, 14, 14, 14, 14, 14, 14, 8, 8, 8]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(160);
  });
});

describe('T-02 excluded corners', () => {
  const corners = [
    { name: 'top-left', r0: 0, c0: 0 },
    { name: 'top-right', r0: 0, c0: BOARD_SIZE - CORNER_SIZE },
    { name: 'bottom-left', r0: BOARD_SIZE - CORNER_SIZE, c0: 0 },
    { name: 'bottom-right', r0: BOARD_SIZE - CORNER_SIZE, c0: BOARD_SIZE - CORNER_SIZE },
  ];

  it('excludes exactly four 3x3 blocks', () => {
    expect(corners).toHaveLength(4);
    let excluded = 0;
    for (const corner of corners) {
      for (let r = corner.r0; r < corner.r0 + CORNER_SIZE; r += 1) {
        for (let c = corner.c0; c < corner.c0 + CORNER_SIZE; c += 1) {
          expect(isPlayable(r, c)).toBe(false);
          excluded += 1;
        }
      }
    }
    expect(excluded).toBe(36);
  });

  it.each(corners)('$name block is entirely absent', ({ r0, c0 }) => {
    for (let r = r0; r < r0 + CORNER_SIZE; r += 1) {
      for (let c = c0; c < c0 + CORNER_SIZE; c += 1) {
        expect(regionOf({ r, c })).toBe('absent');
      }
    }
  });

  it('every square immediately inside a corner block IS playable', () => {
    // The cells that make the cross shape concave.
    for (const [r, c] of [
      [3, 0],
      [3, 2],
      [0, 3],
      [2, 3],
      [3, 13],
      [0, 10],
      [13, 3],
      [10, 0],
      [13, 10],
      [10, 13],
    ] as const) {
      expect(isPlayable(r, c)).toBe(true);
    }
  });
});

describe('bounds checking', () => {
  it('rejects out-of-range and non-integer coordinates', () => {
    expect(isInBounds(-1, 5)).toBe(false);
    expect(isInBounds(14, 5)).toBe(false);
    expect(isInBounds(5, -1)).toBe(false);
    expect(isInBounds(5, 14)).toBe(false);
    expect(isInBounds(1.5, 5)).toBe(false);
    expect(isPlayable(-1, -1)).toBe(false);
    expect(isPlayable(999, 999)).toBe(false);
  });
});

describe('regions partition the board', () => {
  it('centre 64 + four arms of 24 = 160', () => {
    const counts = { centre: 0, top: 0, bottom: 0, left: 0, right: 0, absent: 0 };
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        counts[regionOf({ r, c })] += 1;
      }
    }
    expect(counts).toEqual({ centre: 64, top: 24, bottom: 24, left: 24, right: 24, absent: 36 });
  });
});
