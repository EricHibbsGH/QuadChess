/**
 * Canonical coordinate system for the four-player board.
 *
 * Internal representation is always `{ r, c }` with:
 *   r = row index, 0 at the TOP, 13 at the BOTTOM
 *   c = column index, 0 at the LEFT, 13 at the RIGHT
 *
 * Human notation is `<file><rank>` where file `a`..`n` is `c` and
 * `rank = 14 - r`, so `h1` is `{ r: 13, c: 7 }`.
 *
 * See rules.md §1 and §2. This module is the ONLY place that knows the board
 * is a cross; every movement generator routes through `isPlayable`.
 */

export const BOARD_SIZE = 14;
export const CORNER_SIZE = 3;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE; // 196
export const PLAYABLE_COUNT = 160;

export const FILES = 'abcdefghijklmn';

export interface Coord {
  readonly r: number;
  readonly c: number;
}

export interface Vec {
  readonly dr: number;
  readonly dc: number;
}

/** Which arm of the cross an army sits on. Seating is rules-profile data. */
export type Seat = 'top' | 'bottom' | 'left' | 'right';

export const SEATS: readonly Seat[] = ['top', 'right', 'bottom', 'left'] as const;

// --------------------------------------------------------------------------
// Topology
// --------------------------------------------------------------------------

export function isInBounds(r: number, c: number): boolean {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/**
 * Rule T-1: the single topology predicate. A cell is playable when it is in
 * bounds and NOT inside one of the four 3x3 corner blocks.
 */
export function isPlayable(r: number, c: number): boolean {
  if (!isInBounds(r, c)) return false;
  const lowRow = r < CORNER_SIZE;
  const highRow = r >= BOARD_SIZE - CORNER_SIZE;
  const lowCol = c < CORNER_SIZE;
  const highCol = c >= BOARD_SIZE - CORNER_SIZE;
  return !((lowRow || highRow) && (lowCol || highCol));
}

export function isPlayableCoord(coord: Coord): boolean {
  return isPlayable(coord.r, coord.c);
}

// --------------------------------------------------------------------------
// Flat indexing (board storage detail; never a rule)
// --------------------------------------------------------------------------

export function toIndex(r: number, c: number): number {
  return r * BOARD_SIZE + c;
}

export function coordToIndex(coord: Coord): number {
  return toIndex(coord.r, coord.c);
}

export function indexToCoord(i: number): Coord {
  return { r: Math.floor(i / BOARD_SIZE), c: i % BOARD_SIZE };
}

export function isPlayableIndex(i: number): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= CELL_COUNT) return false;
  return isPlayable(Math.floor(i / BOARD_SIZE), i % BOARD_SIZE);
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.r === b.r && a.c === b.c;
}

// --------------------------------------------------------------------------
// Notation
// --------------------------------------------------------------------------

export function toNotation(coord: Coord): string {
  const file = FILES[coord.c];
  if (file === undefined || !isInBounds(coord.r, coord.c)) {
    throw new RangeError(`coordinate out of range: r=${coord.r} c=${coord.c}`);
  }
  return `${file}${BOARD_SIZE - coord.r}`;
}

/** Returns null for malformed input and for any square that is not playable. Never throws. */
export function fromNotation(text: string): Coord | null {
  if (typeof text !== 'string') return null;
  const match = /^([a-n])(\d{1,2})$/.exec(text.trim().toLowerCase());
  if (!match) return null;
  const fileChar = match[1] as string;
  const rankText = match[2] as string;
  const rank = Number.parseInt(rankText, 10);
  if (!Number.isInteger(rank) || rank < 1 || rank > BOARD_SIZE) return null;
  const c = FILES.indexOf(fileChar);
  const r = BOARD_SIZE - rank;
  if (!isPlayable(r, c)) return null;
  return { r, c };
}

// --------------------------------------------------------------------------
// Enumeration
// --------------------------------------------------------------------------

const PLAYABLE_COORDS: readonly Coord[] = (() => {
  const out: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (isPlayable(r, c)) out.push(Object.freeze({ r, c }));
    }
  }
  return Object.freeze(out);
})();

export function allPlayableCoords(): readonly Coord[] {
  return PLAYABLE_COORDS;
}

const PLAYABLE_INDICES: readonly number[] = Object.freeze(PLAYABLE_COORDS.map(coordToIndex));

export function allPlayableIndices(): readonly number[] {
  return PLAYABLE_INDICES;
}

// --------------------------------------------------------------------------
// Regions (rules.md §2.4)
// --------------------------------------------------------------------------

export type Region = 'centre' | 'top' | 'bottom' | 'left' | 'right' | 'absent';

export function regionOf(coord: Coord): Region {
  const { r, c } = coord;
  if (!isPlayable(r, c)) return 'absent';
  const midRow = r >= CORNER_SIZE && r < BOARD_SIZE - CORNER_SIZE;
  const midCol = c >= CORNER_SIZE && c < BOARD_SIZE - CORNER_SIZE;
  if (midRow && midCol) return 'centre';
  if (!midRow && midCol) return r < CORNER_SIZE ? 'top' : 'bottom';
  return c < CORNER_SIZE ? 'left' : 'right';
}

/** The three-file/rank deep arm an army starts on. */
export function isInHomeArm(seat: Seat, coord: Coord): boolean {
  return regionOf(coord) === seat;
}

// --------------------------------------------------------------------------
// Per-seat geometry
// --------------------------------------------------------------------------

const FORWARD: Readonly<Record<Seat, Vec>> = Object.freeze({
  top: { dr: 1, dc: 0 },
  bottom: { dr: -1, dc: 0 },
  left: { dr: 0, dc: 1 },
  right: { dr: 0, dc: -1 },
});

export function forwardVector(seat: Seat): Vec {
  return FORWARD[seat];
}

/** The two diagonal capture vectors, derived from the forward vector. */
export function pawnCaptureVectors(seat: Seat): readonly [Vec, Vec] {
  const f = FORWARD[seat];
  if (f.dr === 0) {
    return [
      { dr: -1, dc: f.dc },
      { dr: 1, dc: f.dc },
    ];
  }
  return [
    { dr: f.dr, dc: -1 },
    { dr: f.dr, dc: 1 },
  ];
}

export interface Line {
  readonly axis: 'row' | 'col';
  readonly index: number;
}

/** The outermost line of the army's arm, where the major pieces start. */
export function backLine(seat: Seat): Line {
  switch (seat) {
    case 'top':
      return { axis: 'row', index: 0 };
    case 'bottom':
      return { axis: 'row', index: BOARD_SIZE - 1 };
    case 'left':
      return { axis: 'col', index: 0 };
    case 'right':
      return { axis: 'col', index: BOARD_SIZE - 1 };
  }
}

/** The line where the army's pawns start; double-stepping is allowed only from here. */
export function homeLine(seat: Seat): Line {
  const back = backLine(seat);
  const f = FORWARD[seat];
  const delta = f.dr !== 0 ? f.dr : f.dc;
  return { axis: back.axis, index: back.index + delta };
}

export type PromotionZone = 'farEdgeOfCentralBand' | 'opponentBackLine';

/**
 * Default `farEdgeOfCentralBand` promotes on the far edge of the middle 8x8:
 * Yellow rank 11, Green rank 4, Blue file k, Red file d (rules.md AMB-3).
 */
export function promotionLine(seat: Seat, zone: PromotionZone = 'farEdgeOfCentralBand'): Line {
  const back = backLine(seat);
  const far = back.index === 0 ? BOARD_SIZE - 1 : 0;
  if (zone === 'opponentBackLine') {
    return { axis: back.axis, index: far };
  }
  const edge = back.index === 0 ? BOARD_SIZE - 1 - CORNER_SIZE : CORNER_SIZE;
  return { axis: back.axis, index: edge };
}

export function isOnLine(line: Line, coord: Coord): boolean {
  return line.axis === 'row' ? coord.r === line.index : coord.c === line.index;
}

export function isOnHomeLine(seat: Seat, coord: Coord): boolean {
  return isOnLine(homeLine(seat), coord);
}

export function isOnPromotionLine(seat: Seat, coord: Coord, zone?: PromotionZone): boolean {
  return isOnLine(promotionLine(seat, zone), coord);
}

/**
 * The eight back-line squares in the OWNER's left-to-right order. Every army's
 * setup, and all castling geometry, is generated from this one ordering, which
 * is what makes the position exactly 90-degree rotationally symmetric.
 */
export function backLineSquares(seat: Seat): readonly Coord[] {
  const lo = CORNER_SIZE;
  const hi = BOARD_SIZE - CORNER_SIZE - 1; // 10
  const out: Coord[] = [];
  switch (seat) {
    case 'bottom': // faces up; owner's left is the board's left
      for (let c = lo; c <= hi; c += 1) out.push({ r: BOARD_SIZE - 1, c });
      break;
    case 'left': // faces right; owner's left is the board's top
      for (let r = lo; r <= hi; r += 1) out.push({ r, c: 0 });
      break;
    case 'top': // faces down; owner's left is the board's right
      for (let c = hi; c >= lo; c -= 1) out.push({ r: 0, c });
      break;
    case 'right': // faces left; owner's left is the board's bottom
      for (let r = hi; r >= lo; r -= 1) out.push({ r, c: BOARD_SIZE - 1 });
      break;
  }
  return out;
}

/** The eight pawn squares, in the same owner-relative order as `backLineSquares`. */
export function pawnLineSquares(seat: Seat): readonly Coord[] {
  const f = FORWARD[seat];
  return backLineSquares(seat).map((sq) => ({ r: sq.r + f.dr, c: sq.c + f.dc }));
}

// --------------------------------------------------------------------------
// Display rotation (UI only — the engine never calls this)
// --------------------------------------------------------------------------

/**
 * Maps canonical coordinates to view coordinates so `seat` appears at the
 * bottom of the screen. Each transform is a symmetry of the cross, so a rotated
 * view is still a valid board shape.
 */
export function rotateForSeat(coord: Coord, seat: Seat): Coord {
  const max = BOARD_SIZE - 1;
  switch (seat) {
    case 'bottom':
      return { r: coord.r, c: coord.c };
    case 'left':
      return { r: max - coord.c, c: coord.r };
    case 'top':
      return { r: max - coord.r, c: max - coord.c };
    case 'right':
      return { r: coord.c, c: max - coord.r };
  }
}

/** Inverse of `rotateForSeat`, for turning a clicked view cell back into engine space. */
export function unrotateForSeat(view: Coord, seat: Seat): Coord {
  const max = BOARD_SIZE - 1;
  switch (seat) {
    case 'bottom':
      return { r: view.r, c: view.c };
    case 'left':
      return { r: view.c, c: max - view.r };
    case 'top':
      return { r: max - view.r, c: max - view.c };
    case 'right':
      return { r: max - view.c, c: view.r };
  }
}

/** Light/dark colouring is cosmetic only (rules.md §1.2). */
export function isLightSquare(coord: Coord): boolean {
  return (coord.r + coord.c) % 2 === 0;
}
