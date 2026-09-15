/**
 * Game state and the move pipeline (architecture.md §4).
 *
 * `applyMove` executes the nine required steps and returns a NEW state plus a
 * structured result. Nothing here mutates its input (INV-9), and an illegal
 * request returns `{ ok: false }` rather than throwing.
 */

import { CELL_COUNT, coordToIndex, type Coord } from './coordinates.js';
import { initialBoard, pieceAt, type Board } from './board.js';
import { isInCheck, checkersOf } from './check.js';
import {
  ACTIVE_STATUS,
  evaluateEnd,
  drawResult,
  initialStatus,
  retirePieces,
  teamLossResult,
  type EliminationReason,
  type GameResult,
  type PlayerStatus,
  type StatusTable,
} from './elimination.js';
import { findLegalMove, hasLegalMove, applyMoveToBoard, legalMoves, legalMovesFrom } from './legalMoves.js';
import { decorateText, moveToText } from './notation.js';
import { COLOR_TAGS, type PieceType, type PlayerColor } from './pieces.js';
import type { EnPassantTarget, Move, MoveContext } from './movement.js';
import { addScore, captureValue, emptyScores, type ScoreTable } from './scoring.js';
import { nextActiveAfter, sortByTurnOrder } from './turnOrder.js';
import { RULES_VERSION, type RulesProfile, type RulesVersion } from '../rules/types.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface MoveRecord {
  readonly kind: 'move';
  readonly ply: number;
  readonly color: PlayerColor;
  readonly move: Move;
  readonly text: string;
  /** Players left in check by this move. */
  readonly checks: readonly PlayerColor[];
  readonly points: number;
}

export interface ActionRecord {
  readonly kind: 'resign' | 'timeout';
  readonly ply: number;
  readonly color: PlayerColor;
  readonly text: string;
}

export type HistoryEntry = MoveRecord | ActionRecord;

export type GameEvent =
  | { readonly kind: 'move'; readonly color: PlayerColor; readonly text: string; readonly move: Move }
  | {
      readonly kind: 'capture';
      readonly by: PlayerColor;
      readonly type: PieceType;
      readonly owner: PlayerColor;
      readonly at: Coord;
      readonly points: number;
    }
  | { readonly kind: 'promotion'; readonly color: PlayerColor; readonly to: PieceType; readonly at: Coord }
  | { readonly kind: 'check'; readonly color: PlayerColor; readonly by: readonly PlayerColor[] }
  | { readonly kind: 'checkmate'; readonly color: PlayerColor }
  | { readonly kind: 'stalemate'; readonly color: PlayerColor }
  | { readonly kind: 'skip'; readonly color: PlayerColor }
  | { readonly kind: 'elimination'; readonly color: PlayerColor; readonly reason: EliminationReason }
  | { readonly kind: 'score'; readonly color: PlayerColor; readonly points: number; readonly total: number }
  | { readonly kind: 'gameEnd'; readonly result: GameResult };

export interface GameState {
  readonly rulesVersion: RulesVersion;
  readonly profileId: string;
  readonly board: Board;
  readonly toMove: PlayerColor;
  readonly active: readonly PlayerColor[];
  readonly status: StatusTable;
  readonly scores: ScoreTable;
  /** Pieces captured BY each player, for the captured-piece display. */
  readonly captured: Readonly<Record<PlayerColor, readonly PieceType[]>>;
  readonly enPassant: EnPassantTarget | null;
  readonly halfmoveClock: number;
  readonly ply: number;
  readonly history: readonly HistoryEntry[];
  readonly repetition: Readonly<Record<string, number>>;
  readonly clocks: Readonly<Record<PlayerColor, number>> | null;
  readonly result: GameResult | null;
}

export type IllegalMoveReason =
  | 'gameOver'
  | 'notYourTurn'
  | 'noPiece'
  | 'notYourPiece'
  | 'illegalMove'
  | 'promotionRequired'
  | 'historyLimit'
  | 'playerNotActive';

export type MoveOutcome =
  | { readonly ok: true; readonly state: GameState; readonly record: HistoryEntry; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: IllegalMoveReason; readonly detail: string };

export interface MoveRequest {
  readonly from: Coord;
  readonly to: Coord;
  readonly promotion?: PieceType | null;
}

// --------------------------------------------------------------------------
// Construction
// --------------------------------------------------------------------------

export function createGame(profile: RulesProfile): GameState {
  const first = profile.turnOrder[0];
  if (first === undefined) throw new Error('rules profile has an empty turn order');

  const clocks =
    profile.timeControl === null
      ? null
      : (Object.fromEntries(
          profile.turnOrder.map((color) => [color, profile.timeControl?.initialMs ?? 0]),
        ) as Record<PlayerColor, number>);

  const captured = Object.fromEntries(
    profile.turnOrder.map((color) => [color, [] as readonly PieceType[]]),
  ) as Record<PlayerColor, readonly PieceType[]>;

  const state: GameState = {
    rulesVersion: RULES_VERSION,
    profileId: profile.id,
    board: initialBoard(profile),
    toMove: first,
    active: [...profile.turnOrder],
    status: initialStatus(profile),
    scores: emptyScores(profile),
    captured,
    enPassant: null,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetition: {},
    clocks,
    result: null,
  };

  return { ...state, repetition: { [positionKey(state)]: 1 } };
}

export function contextOf(state: GameState, profile: RulesProfile): MoveContext {
  return { board: state.board, profile, enPassant: state.enPassant, ply: state.ply };
}

// --------------------------------------------------------------------------
// Position identity (repetition detection)
// --------------------------------------------------------------------------

/**
 * Includes castling rights (via `hasMoved`), the en-passant target, the side to
 * move and the active set, so repetition means a genuinely identical position
 * (rules.md AMB-10).
 */
export function positionKey(state: GameState): string {
  let board = '';
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = state.board[i];
    if (!piece) {
      board += '.';
      continue;
    }
    const tag = COLOR_TAGS[piece.owner];
    board += `${tag}${piece.type}${piece.hasMoved ? 'm' : '-'}${piece.dead ? 'x' : '-'}`;
  }
  const ep = state.enPassant ? `${state.enPassant.square.r},${state.enPassant.square.c}` : '-';
  return `${board}|${state.toMove}|${state.active.join('')}|${ep}`;
}

// --------------------------------------------------------------------------
// Mutable working copy used inside the pipeline
// --------------------------------------------------------------------------

interface Draft {
  board: Board;
  toMove: PlayerColor;
  active: readonly PlayerColor[];
  status: StatusTable;
  scores: ScoreTable;
  captured: Record<PlayerColor, readonly PieceType[]>;
  enPassant: EnPassantTarget | null;
  halfmoveClock: number;
  ply: number;
  history: readonly HistoryEntry[];
  repetition: Record<string, number>;
  clocks: Record<PlayerColor, number> | null;
  result: GameResult | null;
}

function toDraft(state: GameState): Draft {
  return {
    board: state.board,
    toMove: state.toMove,
    active: state.active,
    status: state.status,
    scores: state.scores,
    captured: { ...state.captured },
    enPassant: state.enPassant,
    halfmoveClock: state.halfmoveClock,
    ply: state.ply,
    history: state.history,
    repetition: { ...state.repetition },
    clocks: state.clocks ? { ...state.clocks } : null,
    result: state.result,
  };
}

function fromDraft(state: GameState, draft: Draft): GameState {
  return {
    rulesVersion: state.rulesVersion,
    profileId: state.profileId,
    board: draft.board,
    toMove: draft.toMove,
    active: draft.active,
    status: draft.status,
    scores: draft.scores,
    captured: draft.captured,
    enPassant: draft.enPassant,
    halfmoveClock: draft.halfmoveClock,
    ply: draft.ply,
    history: draft.history,
    repetition: draft.repetition,
    clocks: draft.clocks,
    result: draft.result,
  };
}

function draftContext(draft: Draft, profile: RulesProfile): MoveContext {
  return { board: draft.board, profile, enPassant: draft.enPassant, ply: draft.ply };
}

// --------------------------------------------------------------------------
// Elimination inside the pipeline
// --------------------------------------------------------------------------

function eliminate(
  draft: Draft,
  profile: RulesProfile,
  color: PlayerColor,
  reason: EliminationReason,
  events: GameEvent[],
): void {
  if (draft.status[color]?.kind === 'eliminated') return;
  const status: PlayerStatus = { kind: 'eliminated', by: reason, atPly: draft.ply };
  draft.status = { ...draft.status, [color]: status };
  draft.active = sortByTurnOrder(
    profile,
    draft.active.filter((c) => c !== color),
  );
  draft.board = retirePieces(draft.board, profile, color);
  if (draft.enPassant?.owner === color) draft.enPassant = null;
  events.push({ kind: 'elimination', color, reason });
}

function award(draft: Draft, color: PlayerColor, points: number, events: GameEvent[]): void {
  if (points === 0) return;
  draft.scores = addScore(draft.scores, color, points);
  events.push({ kind: 'score', color, points, total: draft.scores[color] ?? 0 });
}

// --------------------------------------------------------------------------
// Turn settlement — the heart of elimination-aware rotation
// --------------------------------------------------------------------------

/**
 * Evaluates players in turn order starting at `candidate` until one has a legal
 * move, or the game ends. Handles checkmate, stalemate, skipping and the
 * all-stalemated draw guard.
 *
 * `credit` is the player who gets checkmate bonuses (the player who just moved).
 */
function settle(
  draft: Draft,
  profile: RulesProfile,
  candidate: PlayerColor | null,
  credit: PlayerColor | null,
  events: GameEvent[],
): void {
  let current = candidate;
  const skipped = new Set<PlayerColor>();

  for (let guard = 0; guard <= profile.turnOrder.length * 2 + 2; guard += 1) {
    if (draft.result) return;

    if (current === null || draft.active.length === 0) {
      draft.result = evaluateEnd(profile, draft.active, draft.scores, draft.ply);
      if (draft.result) events.push({ kind: 'gameEnd', result: draft.result });
      return;
    }

    const ctx = draftContext(draft, profile);

    if (hasLegalMove(ctx, current)) {
      draft.toMove = current;
      const checking = checkersOf(ctx, current);
      if (checking.length > 0) {
        const by = [...new Set(checking.map((sq) => draft.board[sq.r * 14 + sq.c]?.owner).filter(Boolean))] as PlayerColor[];
        events.push({ kind: 'check', color: current, by });
      }
      return;
    }

    const mated = isInCheck(ctx, current);

    if (mated) {
      events.push({ kind: 'checkmate', color: current });
      if (profile.onCheckmate === 'teamLoses' && profile.teams !== null) {
        draft.toMove = current;
        draft.result = teamLossResult(profile, current, 'checkmate', draft.ply);
        events.push({ kind: 'gameEnd', result: draft.result });
        return;
      }
      if (credit !== null && credit !== current) {
        award(draft, credit, profile.scoringEnabled ? profile.checkmateBonus : 0, events);
      }
      eliminate(draft, profile, current, 'checkmate', events);
    } else {
      events.push({ kind: 'stalemate', color: current });
      if (profile.onStalemate === 'skipTurn') {
        skipped.add(current);
        events.push({ kind: 'skip', color: current });
        if (skipped.size >= draft.active.length) {
          draft.toMove = current;
          draft.result = drawResult(
            'allStalemated',
            'Draw: no remaining player has a legal move.',
            draft.ply,
          );
          events.push({ kind: 'gameEnd', result: draft.result });
          return;
        }
        current = nextActiveAfter(profile, draft.active, current);
        continue;
      }
      if (profile.onStalemate === 'eliminatePlayerWithBonus') {
        award(draft, current, profile.scoringEnabled ? profile.stalemateBonus : 0, events);
      }
      eliminate(draft, profile, current, 'stalemate', events);
    }

    // Someone was eliminated: award the survivor bonus and test for the end.
    awardSoleSurvivor(draft, profile, events);
    const end = evaluateEnd(profile, draft.active, draft.scores, draft.ply);
    if (end) {
      draft.result = end;
      events.push({ kind: 'gameEnd', result: end });
      return;
    }

    current = nextActiveAfter(profile, draft.active, current);
  }

  // Unreachable in practice; fail safe rather than spin.
  draft.result = drawResult('allStalemated', 'Draw: no player could be given a turn.', draft.ply);
  events.push({ kind: 'gameEnd', result: draft.result });
}

function awardSoleSurvivor(draft: Draft, profile: RulesProfile, events: GameEvent[]): void {
  if (profile.teams !== null || !profile.scoringEnabled) return;
  if (draft.active.length !== 1) return;
  const survivor = draft.active[0];
  if (survivor) award(draft, survivor, profile.soleSurvivorBonus, events);
}

// --------------------------------------------------------------------------
// Draw counters
// --------------------------------------------------------------------------

function applyDrawCounters(draft: Draft, profile: RulesProfile, events: GameEvent[]): void {
  if (draft.result) return;

  if (profile.fiftyMoveRule.enabled && draft.halfmoveClock >= profile.fiftyMoveRule.plyLimit) {
    draft.result = drawResult(
      'fiftyMove',
      `Draw: ${profile.fiftyMoveRule.plyLimit} plies without a capture or a pawn move.`,
      draft.ply,
    );
    events.push({ kind: 'gameEnd', result: draft.result });
    return;
  }

  if (profile.threefoldRepetition.enabled) {
    const key = positionKey(fromDraftShallow(draft));
    const count = (draft.repetition[key] ?? 0) + 1;
    draft.repetition = { ...draft.repetition, [key]: count };
    if (count >= profile.threefoldRepetition.count) {
      draft.result = drawResult(
        'threefold',
        `Draw: the position repeated ${count} times.`,
        draft.ply,
      );
      events.push({ kind: 'gameEnd', result: draft.result });
    }
  }
}

/** Minimal shape `positionKey` needs, without rebuilding a whole GameState. */
function fromDraftShallow(draft: Draft): GameState {
  return {
    rulesVersion: RULES_VERSION,
    profileId: '',
    board: draft.board,
    toMove: draft.toMove,
    active: draft.active,
    status: draft.status,
    scores: draft.scores,
    captured: draft.captured,
    enPassant: draft.enPassant,
    halfmoveClock: draft.halfmoveClock,
    ply: draft.ply,
    history: draft.history,
    repetition: {},
    clocks: draft.clocks,
    result: null,
  };
}

// --------------------------------------------------------------------------
// The move pipeline
// --------------------------------------------------------------------------

export function applyMove(state: GameState, profile: RulesProfile, request: MoveRequest): MoveOutcome {
  if (state.result) {
    return { ok: false, reason: 'gameOver', detail: 'The game is already finished.' };
  }
  if (state.history.length >= profile.maxMoveHistoryPlies) {
    return { ok: false, reason: 'historyLimit', detail: 'Move history limit reached.' };
  }

  const ctx = contextOf(state, profile);
  const piece = pieceAt(state.board, request.from);
  if (!piece) {
    return { ok: false, reason: 'noPiece', detail: 'There is no piece on that square.' };
  }
  if (piece.owner !== state.toMove || piece.dead) {
    return { ok: false, reason: 'notYourPiece', detail: `It is ${state.toMove}'s turn.` };
  }

  // Steps 1-4 and 6-7: generation already filtered geometry, path, occupancy and check.
  const candidates = legalMovesFrom(ctx, request.from).filter(
    (move) => move.to.r === request.to.r && move.to.c === request.to.c,
  );
  if (candidates.length === 0) {
    return { ok: false, reason: 'illegalMove', detail: 'That move is not legal here.' };
  }

  const move = request.promotion
    ? candidates.find((candidate) => candidate.promotion === request.promotion)
    : candidates.length === 1
      ? candidates[0]
      : undefined;

  if (!move) {
    if (!request.promotion && candidates.length > 1) {
      return { ok: false, reason: 'promotionRequired', detail: 'Choose a promotion piece.' };
    }
    return { ok: false, reason: 'illegalMove', detail: 'That move is not legal here.' };
  }

  return commitMove(state, profile, move);
}

/** Applies an already-validated move. Exported for replay during import. */
export function commitMove(state: GameState, profile: RulesProfile, move: Move): MoveOutcome {
  const events: GameEvent[] = [];
  const draft = toDraft(state);
  const mover = move.color;

  // Step 5: apply to a copied board.
  draft.board = applyMoveToBoard(draft.board, move, profile);

  // Step 8: captures, scoring, promotion, en-passant bookkeeping, clocks.
  const points = captureValue(profile, move.capture);
  if (move.capture) {
    draft.captured = {
      ...draft.captured,
      [mover]: [...(draft.captured[mover] ?? []), move.capture.type],
    };
    events.push({
      kind: 'capture',
      by: mover,
      type: move.capture.type,
      owner: move.capture.owner,
      at: move.capture.at,
      points,
    });
    award(draft, mover, points, events);
  }
  if (move.promotion) {
    events.push({ kind: 'promotion', color: mover, to: move.promotion, at: move.to });
    award(draft, mover, profile.scoringEnabled ? profile.promotionBonus : 0, events);
  }

  draft.halfmoveClock = move.capture || move.piece === 'P' ? 0 : draft.halfmoveClock + 1;
  draft.ply = draft.ply + 1;

  draft.enPassant =
    profile.enPassant && move.doubleStep
      ? buildEnPassantTarget(profile, move, draft.ply)
      : expireEnPassant(draft.enPassant, draft.ply);

  if (draft.clocks && profile.timeControl) {
    const remaining = draft.clocks[mover] ?? 0;
    draft.clocks = { ...draft.clocks, [mover]: remaining + profile.timeControl.incrementMs };
  }

  // Step 9 preparation: settle the next turn, then record and return.
  const nextCandidate = nextActiveAfter(profile, draft.active, mover);
  settle(draft, profile, nextCandidate, mover, events);
  applyDrawCounters(draft, profile, events);

  const checks = events
    .filter((event): event is Extract<GameEvent, { kind: 'check' }> => event.kind === 'check')
    .map((event) => event.color);
  const mate = events.some((event) => event.kind === 'checkmate');

  const text = decorateText(moveToText(move), { check: checks.length > 0, checkmate: mate });
  const record: MoveRecord = {
    kind: 'move',
    ply: state.ply,
    color: mover,
    move,
    text,
    checks,
    points,
  };
  events.unshift({ kind: 'move', color: mover, text, move });

  draft.history = [...draft.history, record];
  return { ok: true, state: fromDraft(state, draft), record, events };
}

function buildEnPassantTarget(profile: RulesProfile, move: Move, ply: number): EnPassantTarget {
  const skipped: Coord = {
    r: (move.from.r + move.to.r) / 2,
    c: (move.from.c + move.to.c) / 2,
  };
  // `nextPlyOnly` gives exactly one opponent the chance; `oneFullRound` lets the
  // target survive until the double-stepping player is due to move again.
  const lifetime = profile.enPassantWindow === 'nextPlyOnly' ? 1 : profile.turnOrder.length;
  return {
    square: skipped,
    pawnAt: move.to,
    owner: move.color,
    createdAtPly: ply,
    expiresAtPly: ply + lifetime,
  };
}

function expireEnPassant(target: EnPassantTarget | null, ply: number): EnPassantTarget | null {
  if (!target) return null;
  return ply < target.expiresAtPly ? target : null;
}

// --------------------------------------------------------------------------
// Resignation and timeout
// --------------------------------------------------------------------------

function retire(
  state: GameState,
  profile: RulesProfile,
  color: PlayerColor,
  reason: 'resign' | 'timeout',
): MoveOutcome {
  if (state.result) {
    return { ok: false, reason: 'gameOver', detail: 'The game is already finished.' };
  }
  if (!state.active.includes(color)) {
    return { ok: false, reason: 'playerNotActive', detail: `${color} is not in the game.` };
  }

  const events: GameEvent[] = [];
  const draft = toDraft(state);
  const setting = reason === 'resign' ? profile.onResign : profile.onTimeout;
  const resultReason = reason === 'resign' ? 'resignation' : 'timeout';

  if (setting === 'teamLoses' && profile.teams !== null) {
    draft.status = { ...draft.status, [color]: { kind: 'eliminated', by: reason, atPly: draft.ply } };
    draft.active = sortByTurnOrder(profile, draft.active.filter((c) => c !== color));
    draft.result = teamLossResult(profile, color, resultReason, draft.ply);
    events.push({ kind: 'elimination', color, reason });
    events.push({ kind: 'gameEnd', result: draft.result });
  } else {
    const wasToMove = draft.toMove === color;
    eliminate(draft, profile, color, reason, events);
    awardSoleSurvivor(draft, profile, events);
    const end = evaluateEnd(profile, draft.active, draft.scores, draft.ply);
    if (end) {
      draft.result = end;
      events.push({ kind: 'gameEnd', result: end });
    } else {
      const candidate = wasToMove
        ? nextActiveAfter(profile, draft.active, color)
        : draft.toMove;
      settle(draft, profile, candidate, null, events);
    }
  }

  const record: ActionRecord = {
    kind: reason,
    ply: state.ply,
    color,
    text: reason === 'resign' ? 'resigns' : 'flag falls',
  };
  draft.history = [...draft.history, record];
  return { ok: true, state: fromDraft(state, draft), record, events };
}

export function resign(state: GameState, profile: RulesProfile, color: PlayerColor): MoveOutcome {
  return retire(state, profile, color, 'resign');
}

export function timeout(state: GameState, profile: RulesProfile, color: PlayerColor): MoveOutcome {
  return retire(state, profile, color, 'timeout');
}

export function agreeDraw(state: GameState, profile: RulesProfile): MoveOutcome {
  if (state.result) {
    return { ok: false, reason: 'gameOver', detail: 'The game is already finished.' };
  }
  const result = drawResult('agreement', 'Draw agreed by all remaining players.', state.ply);
  const record: ActionRecord = { kind: 'resign', ply: state.ply, color: state.toMove, text: 'draw agreed' };
  void profile;
  return {
    ok: true,
    state: { ...state, result },
    record,
    events: [{ kind: 'gameEnd', result }],
  };
}

// --------------------------------------------------------------------------
// Queries used by the UI
// --------------------------------------------------------------------------

export function legalMovesForCurrent(state: GameState, profile: RulesProfile): readonly Move[] {
  if (state.result) return [];
  return legalMoves(contextOf(state, profile), state.toMove);
}

export function legalDestinations(state: GameState, profile: RulesProfile, from: Coord): readonly Move[] {
  if (state.result) return [];
  const piece = pieceAt(state.board, from);
  if (!piece || piece.owner !== state.toMove) return [];
  return legalMovesFrom(contextOf(state, profile), from);
}

export function playersInCheck(state: GameState, profile: RulesProfile): readonly PlayerColor[] {
  const ctx = contextOf(state, profile);
  return state.active.filter((color) => isInCheck(ctx, color));
}

export function kingSquares(state: GameState, profile: RulesProfile): Readonly<Partial<Record<PlayerColor, Coord>>> {
  void profile;
  const out: Partial<Record<PlayerColor, Coord>> = {};
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const piece = state.board[i];
    if (piece && piece.type === 'K' && !piece.dead) {
      out[piece.owner] = { r: Math.floor(i / 14), c: i % 14 };
    }
  }
  return out;
}

export function isPlayerActive(state: GameState, color: PlayerColor): boolean {
  return state.active.includes(color);
}

export { ACTIVE_STATUS, coordToIndex, findLegalMove };
export type { GameResult, PlayerStatus, StatusTable, Move, MoveContext, EnPassantTarget };
