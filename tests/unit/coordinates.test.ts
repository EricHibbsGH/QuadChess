/**
 * Coordinate conversion, per-seat geometry and display rotation (rules.md §2).
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  allPlayableCoords,
  backLine,
  backLineSquares,
  coordToIndex,
  forwardVector,
  fromNotation,
  homeLine,
  indexToCoord,
  isLightSquare,
  isOnPromotionLine,
  isPlayable,
  pawnCaptureVectors,
  pawnLineSquares,
  promotionLine,
  rotateForSeat,
  toNotation,
  unrotateForSeat,
  type Seat,
} from '../../src/engine/coordinates.js';

const SEATS: readonly Seat[] = ['top', 'right', 'bottom', 'left'];

describe('notation round trip', () => {
  it('maps the documented anchor squares', () => {
    expect(toNotation({ r: 13, c: 7 })).toBe('h1');
    expect(toNotation({ r: 6, c: 13 })).toBe('n8');
    expect(toNotation({ r: 0, c: 3 })).toBe('d14');
    expect(toNotation({ r: 3, c: 0 })).toBe('a11');
    expect(fromNotation('h1')).toEqual({ r: 13, c: 7 });
    expect(fromNotation('n8')).toEqual({ r: 6, c: 13 });
  });

  it('round-trips every playable square', () => {
    for (const coord of allPlayableCoords()) {
      expect(fromNotation(toNotation(coord))).toEqual(coord);
    }
  });

  it('returns null for malformed and unplayable input rather than throwing', () => {
    for (const bad of ['', 'z1', 'a0', 'a15', 'aa', '11', 'h', 'h1x', ' ', 'o5']) {
      expect(fromNotation(bad)).toBeNull();
    }
    // a1 is inside the bottom-left corner block.
    expect(fromNotation('a1')).toBeNull();
    expect(fromNotation('c3')).toBeNull();
    expect(fromNotation('n14')).toBeNull();
    expect(fromNotation(42 as unknown as string)).toBeNull();
  });

  it('is case and whitespace tolerant', () => {
    expect(fromNotation('  H1 ')).toEqual({ r: 13, c: 7 });
    expect(fromNotation('N8')).toEqual({ r: 6, c: 13 });
  });
});

describe('flat indexing', () => {
  it('round-trips coordinate to index', () => {
    for (const coord of allPlayableCoords()) {
      expect(indexToCoord(coordToIndex(coord))).toEqual(coord);
    }
  });
});

describe('per-seat geometry (rules.md §6.1)', () => {
  it('assigns the documented forward vectors', () => {
    expect(forwardVector('bottom')).toEqual({ dr: -1, dc: 0 });
    expect(forwardVector('top')).toEqual({ dr: 1, dc: 0 });
    expect(forwardVector('left')).toEqual({ dr: 0, dc: 1 });
    expect(forwardVector('right')).toEqual({ dr: 0, dc: -1 });
  });

  it('derives pawn capture vectors perpendicular to the forward vector', () => {
    expect(pawnCaptureVectors('bottom')).toEqual([
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
    ]);
    expect(pawnCaptureVectors('top')).toEqual([
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
    ]);
    expect(pawnCaptureVectors('left')).toEqual([
      { dr: -1, dc: 1 },
      { dr: 1, dc: 1 },
    ]);
    expect(pawnCaptureVectors('right')).toEqual([
      { dr: -1, dc: -1 },
      { dr: 1, dc: -1 },
    ]);
  });

  it('places back, home and promotion lines where rules.md documents them', () => {
    expect(backLine('bottom')).toEqual({ axis: 'row', index: 13 });
    expect(homeLine('bottom')).toEqual({ axis: 'row', index: 12 });
    expect(promotionLine('bottom')).toEqual({ axis: 'row', index: 3 }); // rank 11

    expect(backLine('top')).toEqual({ axis: 'row', index: 0 });
    expect(homeLine('top')).toEqual({ axis: 'row', index: 1 });
    expect(promotionLine('top')).toEqual({ axis: 'row', index: 10 }); // rank 4

    expect(backLine('left')).toEqual({ axis: 'col', index: 0 });
    expect(homeLine('left')).toEqual({ axis: 'col', index: 1 });
    expect(promotionLine('left')).toEqual({ axis: 'col', index: 10 }); // file k

    expect(backLine('right')).toEqual({ axis: 'col', index: 13 });
    expect(homeLine('right')).toEqual({ axis: 'col', index: 12 });
    expect(promotionLine('right')).toEqual({ axis: 'col', index: 3 }); // file d
  });

  it('supports the alternative opponentBackLine promotion zone', () => {
    expect(promotionLine('bottom', 'opponentBackLine')).toEqual({ axis: 'row', index: 0 });
    expect(promotionLine('right', 'opponentBackLine')).toEqual({ axis: 'col', index: 0 });
  });

  it('AMB-13: every promotion line has 14 playable squares', () => {
    for (const seat of SEATS) {
      const line = promotionLine(seat);
      let playable = 0;
      for (let i = 0; i < BOARD_SIZE; i += 1) {
        const coord = line.axis === 'row' ? { r: line.index, c: i } : { r: i, c: line.index };
        if (isPlayable(coord.r, coord.c)) playable += 1;
      }
      expect(playable, `${seat} promotion line`).toBe(14);
    }
  });

  it('recognises squares on the promotion line including inside enemy arms', () => {
    // A yellow pawn that captured its way to a11 still promotes there.
    expect(isOnPromotionLine('bottom', { r: 3, c: 0 })).toBe(true);
    expect(isOnPromotionLine('bottom', { r: 4, c: 7 })).toBe(false);
  });
});

describe('back line generation', () => {
  it('lists 8 squares per seat, all playable, in owner order', () => {
    for (const seat of SEATS) {
      const back = backLineSquares(seat);
      const pawns = pawnLineSquares(seat);
      expect(back).toHaveLength(8);
      expect(pawns).toHaveLength(8);
      for (const coord of [...back, ...pawns]) {
        expect(isPlayable(coord.r, coord.c)).toBe(true);
      }
    }
  });

  it('matches the documented squares for each seat', () => {
    expect(backLineSquares('bottom').map(toNotation)).toEqual([
      'd1', 'e1', 'f1', 'g1', 'h1', 'i1', 'j1', 'k1',
    ]);
    expect(backLineSquares('left').map(toNotation)).toEqual([
      'a11', 'a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4',
    ]);
    expect(backLineSquares('top').map(toNotation)).toEqual([
      'k14', 'j14', 'i14', 'h14', 'g14', 'f14', 'e14', 'd14',
    ]);
    expect(backLineSquares('right').map(toNotation)).toEqual([
      'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11',
    ]);
  });
});

describe('display rotation', () => {
  it('round-trips through unrotate for every seat and square', () => {
    for (const seat of SEATS) {
      for (const coord of allPlayableCoords()) {
        expect(unrotateForSeat(rotateForSeat(coord, seat), seat)).toEqual(coord);
      }
    }
  });

  it('keeps the rotated board a valid cross shape', () => {
    for (const seat of SEATS) {
      for (const coord of allPlayableCoords()) {
        const view = rotateForSeat(coord, seat);
        expect(isPlayable(view.r, view.c), `${seat} ${toNotation(coord)}`).toBe(true);
      }
    }
  });

  it('puts each seat at the bottom of its own view, moving forward as up', () => {
    for (const seat of SEATS) {
      const back = backLineSquares(seat);
      for (const coord of back) {
        expect(rotateForSeat(coord, seat).r).toBe(13);
      }
      const forward = forwardVector(seat);
      const from = back[0];
      expect(from).toBeDefined();
      if (!from) return;
      const ahead = { r: from.r + forward.dr, c: from.c + forward.dc };
      expect(rotateForSeat(ahead, seat).r).toBe(12);
    }
  });
});

describe('square colouring', () => {
  it('alternates and is cosmetic only', () => {
    expect(isLightSquare({ r: 0, c: 0 })).toBe(true);
    expect(isLightSquare({ r: 0, c: 1 })).toBe(false);
    expect(isLightSquare({ r: 1, c: 1 })).toBe(true);
  });
});
