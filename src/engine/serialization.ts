/**
 * Save / load / import / export (architecture.md §7).
 *
 * A saved game carries BOTH the move list and a snapshot of the final position.
 * Loading replays the moves through the engine and then checks the replayed
 * position against the snapshot. That means:
 *   - an imported file can never inject a position the rules cannot produce,
 *   - undo still works after loading, because every intermediate state exists,
 *   - a corrupted or hand-edited file is rejected rather than half-applied.
 *
 * No `eval`, no `new Function`, no third-party validator.
 */

import { BOARD_SIZE, CELL_COUNT, fromNotation, isPlayableIndex, toNotation } from './coordinates.js';
import { findKing, type Board } from './board.js';
import { isPieceType, isPlayerColor, makePiece, type PieceType, type PlayerColor } from './pieces.js';
import {
  applyMove,
  createGame,
  resign,
  timeout,
  type GameState,
  type HistoryEntry,
} from './gameState.js';
import { resolveProfile, type RulesProfile } from '../rules/index.js';
import { RULES_VERSION } from '../rules/types.js';

export const SAVE_FORMAT = 'four-player-chess' as const;
export const SAVE_FORMAT_VERSION = 1 as const;

export interface SerializedMove {
  readonly kind: 'move' | 'resign' | 'timeout';
  readonly color: PlayerColor;
  readonly from?: string;
  readonly to?: string;
  readonly promotion?: PieceType;
}

export interface SerializedSnapshot {
  /** 196 entries; '' for an empty or absent cell, otherwise e.g. 'YPm' or 'GNd'. */
  readonly board: readonly string[];
  readonly toMove: PlayerColor;
  readonly active: readonly PlayerColor[];
  readonly scores: Readonly<Record<string, number>>;
  readonly ply: number;
  readonly halfmoveClock: number;
  readonly finished: boolean;
}

export interface SavedGame {
  readonly format: typeof SAVE_FORMAT;
  readonly formatVersion: typeof SAVE_FORMAT_VERSION;
  readonly rulesVersion: string;
  readonly profileId: string;
  readonly savedAt: string;
  readonly playerNames: Readonly<Record<string, string>> | null;
  readonly moves: readonly SerializedMove[];
  readonly snapshot: SerializedSnapshot;
}

const COLOR_TAG: Readonly<Record<PlayerColor, string>> = {
  red: 'R',
  blue: 'B',
  yellow: 'Y',
  green: 'G',
};

const COLOR_BY_TAG: Readonly<Record<string, PlayerColor>> = {
  R: 'red',
  B: 'blue',
  Y: 'yellow',
  G: 'green',
};

/** Player names are untrusted text: length-capped here, escaped at render time. */
export const MAX_NAME_LENGTH = 40;

// --------------------------------------------------------------------------
// Serialise
// --------------------------------------------------------------------------

function encodeBoard(board: Board): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = board[i];
    out.push(
      piece ? `${COLOR_TAG[piece.owner]}${piece.type}${piece.hasMoved ? 'm' : ''}${piece.dead ? 'd' : ''}` : '',
    );
  }
  return out;
}

function encodeEntry(entry: HistoryEntry): SerializedMove {
  if (entry.kind !== 'move') {
    return { kind: entry.kind, color: entry.color };
  }
  const base: SerializedMove = {
    kind: 'move',
    color: entry.color,
    from: toNotation(entry.move.from),
    to: toNotation(entry.move.to),
  };
  return entry.move.promotion ? { ...base, promotion: entry.move.promotion } : base;
}

export function snapshotOf(state: GameState): SerializedSnapshot {
  return {
    board: encodeBoard(state.board),
    toMove: state.toMove,
    active: [...state.active],
    scores: { ...state.scores },
    ply: state.ply,
    halfmoveClock: state.halfmoveClock,
    finished: state.result !== null,
  };
}

export function serialize(
  state: GameState,
  playerNames: Readonly<Record<string, string>> | null = null,
): SavedGame {
  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    rulesVersion: state.rulesVersion,
    profileId: state.profileId,
    savedAt: new Date().toISOString(),
    playerNames: playerNames ? sanitiseNames(playerNames) : null,
    moves: state.history.map(encodeEntry),
    snapshot: snapshotOf(state),
  };
}

export function toJson(state: GameState, playerNames?: Readonly<Record<string, string>> | null): string {
  return JSON.stringify(serialize(state, playerNames ?? null), null, 2);
}

function sanitiseNames(names: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(names)) {
    if (!isPlayerColor(key)) continue;
    if (typeof value !== 'string') continue;
    out[key] = value.slice(0, MAX_NAME_LENGTH);
  }
  return out;
}

// --------------------------------------------------------------------------
// Validate
// --------------------------------------------------------------------------

export type LoadResult =
  | { readonly ok: true; readonly state: GameState; readonly profile: RulesProfile; readonly states: readonly GameState[]; readonly playerNames: Readonly<Record<string, string>> | null }
  | { readonly ok: false; readonly reason: string };

function fail(reason: string): LoadResult {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural validation only. Semantic checks happen after the replay. */
function validateShape(raw: unknown, profileLimit: number): SavedGame | string {
  if (!isRecord(raw)) return 'file is not a JSON object';
  if (raw['format'] !== SAVE_FORMAT) return 'not a four-player-chess save file';
  if (raw['formatVersion'] !== SAVE_FORMAT_VERSION) {
    return `unsupported save format version ${String(raw['formatVersion'])}`;
  }
  if (typeof raw['rulesVersion'] !== 'string') return 'missing rulesVersion';
  if (typeof raw['profileId'] !== 'string') return 'missing profileId';

  const moves = raw['moves'];
  if (!Array.isArray(moves)) return 'moves must be an array';
  if (moves.length > profileLimit) return `move list exceeds the ${profileLimit}-ply limit`;

  const parsedMoves: SerializedMove[] = [];
  for (const [index, entry] of moves.entries()) {
    if (!isRecord(entry)) return `move ${index} is not an object`;
    const kind = entry['kind'];
    if (kind !== 'move' && kind !== 'resign' && kind !== 'timeout') {
      return `move ${index} has an unknown kind`;
    }
    const color = entry['color'];
    if (!isPlayerColor(color)) return `move ${index} has an invalid colour`;

    if (kind !== 'move') {
      parsedMoves.push({ kind, color });
      continue;
    }
    const from = entry['from'];
    const to = entry['to'];
    if (typeof from !== 'string' || typeof to !== 'string') return `move ${index} is missing squares`;
    if (!fromNotation(from) || !fromNotation(to)) return `move ${index} names an unplayable square`;
    const promotion = entry['promotion'];
    if (promotion !== undefined && (!isPieceType(promotion) || promotion === 'K' || promotion === 'P')) {
      return `move ${index} has an invalid promotion piece`;
    }
    parsedMoves.push({
      kind,
      color,
      from,
      to,
      ...(promotion === undefined ? {} : { promotion: promotion as PieceType }),
    });
  }

  const snapshot = raw['snapshot'];
  if (!isRecord(snapshot)) return 'missing snapshot';
  const board = snapshot['board'];
  if (!Array.isArray(board) || board.length !== CELL_COUNT) {
    return `snapshot board must have exactly ${CELL_COUNT} cells`;
  }
  for (const [index, cell] of board.entries()) {
    if (typeof cell !== 'string') return `snapshot cell ${index} is not a string`;
    if (cell === '') continue;
    if (!/^[RBYG][KQRBNP]m?d?$/.test(cell)) return `snapshot cell ${index} is malformed`;
    if (!isPlayableIndex(index)) return `snapshot places a piece on absent cell ${index}`;
  }
  if (!isPlayerColor(snapshot['toMove'])) return 'snapshot has an invalid side to move';
  const active = snapshot['active'];
  if (!Array.isArray(active) || !active.every(isPlayerColor)) return 'snapshot has an invalid active list';
  if (new Set(active).size !== active.length) return 'snapshot active list has duplicates';
  const scores = snapshot['scores'];
  if (!isRecord(scores)) return 'snapshot has an invalid score table';
  for (const [key, value] of Object.entries(scores)) {
    if (!isPlayerColor(key)) return `snapshot score has an unknown player ${key}`;
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      return `snapshot score for ${key} is not a finite integer`;
    }
  }
  const ply = snapshot['ply'];
  const halfmoveClock = snapshot['halfmoveClock'];
  if (typeof ply !== 'number' || !Number.isInteger(ply) || ply < 0) return 'snapshot ply is invalid';
  if (typeof halfmoveClock !== 'number' || !Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
    return 'snapshot halfmove clock is invalid';
  }

  const names = raw['playerNames'];
  if (names !== null && names !== undefined && !isRecord(names)) return 'playerNames must be an object';

  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    rulesVersion: raw['rulesVersion'],
    profileId: raw['profileId'],
    savedAt: typeof raw['savedAt'] === 'string' ? raw['savedAt'] : '',
    playerNames: isRecord(names) ? sanitiseNames(names as Record<string, string>) : null,
    moves: parsedMoves,
    snapshot: {
      board: board as readonly string[],
      toMove: snapshot['toMove'],
      active: active as readonly PlayerColor[],
      scores: scores as Record<string, number>,
      ply,
      halfmoveClock,
      finished: snapshot['finished'] === true,
    },
  };
}

/** Board consistency, king count and ownership checks (architecture.md §7). */
export function validateStateSemantics(state: GameState, profile: RulesProfile): string | null {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (state.board[i] && !isPlayableIndex(i)) return `a piece stands on absent cell ${i}`;
  }
  for (const color of state.active) {
    if (!findKing(state.board, color)) return `active player ${color} has no king`;
  }
  for (const color of profile.turnOrder) {
    if (state.active.includes(color)) continue;
    if (findKing(state.board, color)) return `eliminated player ${color} still has a king`;
  }
  let kings = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = state.board[i];
    if (piece?.type === 'K' && !piece.dead) kings += 1;
  }
  if (kings !== state.active.length) return 'king count does not match the active player list';
  if (!state.result && !state.active.includes(state.toMove)) {
    return 'the side to move is not an active player';
  }
  for (const value of Object.values(state.scores)) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return 'a score is not a finite integer';
  }
  return null;
}

function snapshotsMatch(a: SerializedSnapshot, b: SerializedSnapshot): string | null {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (a.board[i] !== b.board[i]) {
      return `replayed position differs from the saved snapshot at ${toNotation({ r: Math.floor(i / BOARD_SIZE), c: i % BOARD_SIZE })}`;
    }
  }
  if (a.toMove !== b.toMove) return 'replayed side to move differs from the snapshot';
  if (a.active.join() !== b.active.join()) return 'replayed active players differ from the snapshot';
  if (a.ply !== b.ply) return 'replayed ply count differs from the snapshot';
  if (a.halfmoveClock !== b.halfmoveClock) return 'replayed halfmove clock differs from the snapshot';
  if (a.finished !== b.finished) return 'replayed game-over state differs from the snapshot';
  for (const [color, value] of Object.entries(b.scores)) {
    if ((a.scores[color] ?? 0) !== value) return `replayed score for ${color} differs from the snapshot`;
  }
  return null;
}

// --------------------------------------------------------------------------
// Load
// --------------------------------------------------------------------------

export interface LoadOptions {
  /** Hard cap applied before parsing, in UTF-16 code units. */
  readonly maxBytes?: number;
}

export function fromJson(text: unknown, options: LoadOptions = {}): LoadResult {
  if (typeof text !== 'string') return fail('import data must be text');
  const maxBytes = options.maxBytes ?? 1_000_000;
  if (text.length > maxBytes) return fail(`import exceeds the ${maxBytes}-character limit`);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('import is not valid JSON');
  }
  return load(raw, options);
}

export function load(raw: unknown, options: LoadOptions = {}): LoadResult {
  void options;
  if (!isRecord(raw)) return fail('file is not a JSON object');

  // Identify the file before anything else, so a foreign file gets a useful
  // message rather than a rules-version complaint.
  if (raw['format'] !== SAVE_FORMAT) return fail('not a four-player-chess save file');
  if (raw['formatVersion'] !== SAVE_FORMAT_VERSION) {
    return fail(`unsupported save format version ${String(raw['formatVersion'])}`);
  }

  // The rules version gates everything else, so resolve it before trusting any field.
  const resolution = resolveProfile(raw['profileId'], raw['rulesVersion']);
  if (!resolution.ok) return fail(resolution.reason);
  const profile = resolution.profile;

  const shape = validateShape(raw, profile.maxMoveHistoryPlies);
  if (typeof shape === 'string') return fail(shape);

  // Replay through the engine: an illegal move in the file simply cannot apply.
  let state = createGame(profile);
  const states: GameState[] = [state];

  for (const [index, entry] of shape.moves.entries()) {
    if (entry.kind === 'resign' || entry.kind === 'timeout') {
      const outcome = entry.kind === 'resign' ? resign(state, profile, entry.color) : timeout(state, profile, entry.color);
      if (!outcome.ok) return fail(`entry ${index} (${entry.kind} by ${entry.color}) is not applicable: ${outcome.detail}`);
      state = outcome.state;
      states.push(state);
      continue;
    }

    if (state.toMove !== entry.color) {
      return fail(`entry ${index} is by ${entry.color} but it is ${state.toMove}'s turn`);
    }
    const from = fromNotation(entry.from ?? '');
    const to = fromNotation(entry.to ?? '');
    if (!from || !to) return fail(`entry ${index} names an unplayable square`);

    const outcome = applyMove(state, profile, {
      from,
      to,
      promotion: entry.promotion ?? null,
    });
    if (!outcome.ok) {
      return fail(`entry ${index} (${entry.from}-${entry.to}) is not legal: ${outcome.detail}`);
    }
    state = outcome.state;
    states.push(state);
  }

  const semantic = validateStateSemantics(state, profile);
  if (semantic) return fail(semantic);

  const mismatch = snapshotsMatch(snapshotOf(state), shape.snapshot);
  if (mismatch) return fail(mismatch);

  return { ok: true, state, profile, states, playerNames: shape.playerNames };
}

// --------------------------------------------------------------------------
// Board decoding, used by tests and by direct snapshot inspection
// --------------------------------------------------------------------------

export function decodeBoard(cells: readonly string[]): Board | null {
  if (cells.length !== CELL_COUNT) return null;
  const board: (ReturnType<typeof makePiece> | null)[] = new Array(CELL_COUNT).fill(null);
  for (const [index, cell] of cells.entries()) {
    if (cell === '') continue;
    if (!isPlayableIndex(index)) return null;
    const tag = cell[0] ?? '';
    const type = cell[1] ?? '';
    const owner = COLOR_BY_TAG[tag];
    if (!owner || !isPieceType(type)) return null;
    board[index] = makePiece(type, owner, {
      hasMoved: cell.includes('m'),
      dead: cell.includes('d'),
    });
  }
  return board;
}

export { RULES_VERSION };
