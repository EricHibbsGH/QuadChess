/**
 * A rules profile is DATA. Every ambiguous behaviour recorded in rules.md §14
 * is a named field here, so variants are added by writing a new object, never
 * by branching inside the engine.
 *
 * The field set mirrors the rules matrix in rules.md §13 one-for-one.
 */

import type { PieceType, PlayerColor } from '../engine/pieces.js';
import type { PromotionZone, Seat } from '../engine/coordinates.js';

/** Bumped whenever a rule change could alter the meaning of an existing game. */
export const RULES_VERSION = '4pc-rules/1.0.0' as const;
export type RulesVersion = typeof RULES_VERSION;

export interface TimeControl {
  readonly initialMs: number;
  readonly incrementMs: number;
}

export interface RulesProfile {
  // ---- identity -----------------------------------------------------------
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly rulesVersion: RulesVersion;

  // ---- setup (rules.md §13.1) ---------------------------------------------
  readonly seating: Readonly<Record<PlayerColor, Seat>>;
  readonly turnOrder: readonly PlayerColor[];
  /** `null` means free-for-all: every other player is an opponent. */
  readonly teams: readonly (readonly PlayerColor[])[] | null;
  /** Back line read from the OWNER's left to right. */
  readonly backLineOrder: readonly PieceType[];

  // ---- movement (rules.md §13.2) ------------------------------------------
  readonly knightDestinationOnly: boolean;
  readonly pawnDoubleStep: 'fromHomeLineOnly' | 'never';
  readonly enPassant: boolean;
  readonly enPassantWindow: 'nextPlyOnly' | 'oneFullRound';
  readonly castling: boolean;
  readonly castlingConsidersTeammateAttacks: boolean;
  readonly promotionZone: PromotionZone;
  readonly promotionPieces: readonly PieceType[];
  readonly promotionMandatory: boolean;
  readonly promotionChoice: 'player' | 'alwaysQueen';

  // ---- legality (rules.md §13.3) ------------------------------------------
  readonly mustResolveOwnCheck: boolean;
  readonly teammateAttacksGiveCheck: boolean;
  readonly mayExposeTeammateKing: boolean;
  readonly kingCaptureAllowed: boolean;
  readonly captureTeammate: boolean;

  // ---- elimination and result (rules.md §13.4) ----------------------------
  readonly onCheckmate: 'teamLoses' | 'eliminatePlayer';
  readonly onStalemate: 'skipTurn' | 'eliminatePlayerWithBonus' | 'eliminatePlayer';
  readonly onResign: 'teamLoses' | 'eliminatePlayer';
  readonly onTimeout: 'teamLoses' | 'eliminatePlayer';
  readonly eliminatedPieceBehavior: 'removed' | 'remainAsDead';
  readonly eliminatedKingBehavior: 'removed';
  readonly deadPiecesGiveCheck: boolean;
  readonly deadPiecesBlock: boolean;
  readonly deadPiecesCapturable: boolean;
  readonly allPlayersStalemated: 'draw';

  // ---- scoring, clocks, draws, limits (rules.md §13.5) --------------------
  readonly scoringEnabled: boolean;
  readonly pieceValues: Readonly<Record<PieceType, number>>;
  readonly checkmateBonus: number;
  readonly stalemateBonus: number;
  readonly soleSurvivorBonus: number;
  readonly promotionBonus: number;
  readonly deadPieceCaptureValue: 'normal' | 'zero';
  readonly resignAwardsPoints: boolean;
  readonly timeControl: TimeControl | null;
  readonly fiftyMoveRule: { readonly enabled: boolean; readonly plyLimit: number };
  readonly threefoldRepetition: { readonly enabled: boolean; readonly count: number };
  readonly insufficientMaterial: 'off';
  readonly drawOffers: 'unanimous';
  readonly maxMoveHistoryPlies: number;
  readonly maxImportBytes: number;
}

// --------------------------------------------------------------------------
// Derived queries — the engine asks these instead of reading fields directly
// --------------------------------------------------------------------------

export function seatOf(profile: RulesProfile, color: PlayerColor): Seat {
  return profile.seating[color];
}

export function colorAtSeat(profile: RulesProfile, seat: Seat): PlayerColor | null {
  for (const color of profile.turnOrder) {
    if (profile.seating[color] === seat) return color;
  }
  return null;
}

/** Teammates in a team profile; in free-for-all nobody is an ally but yourself. */
export function areAllies(profile: RulesProfile, a: PlayerColor, b: PlayerColor): boolean {
  if (a === b) return true;
  if (profile.teams === null) return false;
  return profile.teams.some((team) => team.includes(a) && team.includes(b));
}

export function teamIndexOf(profile: RulesProfile, color: PlayerColor): number {
  if (profile.teams === null) return profile.turnOrder.indexOf(color);
  return profile.teams.findIndex((team) => team.includes(color));
}

export function teammatesOf(profile: RulesProfile, color: PlayerColor): readonly PlayerColor[] {
  if (profile.teams === null) return [];
  const team = profile.teams.find((t) => t.includes(color));
  return team ? team.filter((c) => c !== color) : [];
}

export function opponentsOf(profile: RulesProfile, color: PlayerColor): readonly PlayerColor[] {
  return profile.turnOrder.filter((other) => !areAllies(profile, color, other));
}

export function teamLabel(profile: RulesProfile, color: PlayerColor): string {
  if (profile.teams === null) return color;
  const index = teamIndexOf(profile, color);
  return index >= 0 ? `Team ${index + 1}` : color;
}

// --------------------------------------------------------------------------
// Shared defaults
// --------------------------------------------------------------------------

/**
 * Seating as shown in the reference image (rules.md §3.1).
 * Green top, Blue left, Red right, Yellow bottom.
 */
export const IMAGE_SEATING: Readonly<Record<PlayerColor, Seat>> = Object.freeze({
  green: 'top',
  blue: 'left',
  red: 'right',
  yellow: 'bottom',
});

/**
 * Classic four-player seating, where teammates sit opposite one another
 * (rules.md AMB-1, resolution C).
 */
export const CLASSIC_SEATING: Readonly<Record<PlayerColor, Seat>> = Object.freeze({
  red: 'bottom',
  blue: 'left',
  yellow: 'top',
  green: 'right',
});

export const DEFAULT_TURN_ORDER: readonly PlayerColor[] = Object.freeze([
  'red',
  'blue',
  'yellow',
  'green',
]);

/** Standard chess order, read from the owner's own left to right. */
export const DEFAULT_BACK_LINE: readonly PieceType[] = Object.freeze([
  'R',
  'N',
  'B',
  'Q',
  'K',
  'B',
  'N',
  'R',
]);

/** rules.md §12.1 — our documented values, not a transcription of any product. */
export const DEFAULT_PIECE_VALUES: Readonly<Record<PieceType, number>> = Object.freeze({
  P: 1,
  N: 3,
  B: 5,
  R: 5,
  Q: 9,
  K: 20,
});

/** Every field the two shipped profiles agree on. */
export const SHARED_DEFAULTS = Object.freeze({
  rulesVersion: RULES_VERSION,
  seating: IMAGE_SEATING,
  turnOrder: DEFAULT_TURN_ORDER,
  backLineOrder: DEFAULT_BACK_LINE,

  knightDestinationOnly: true,
  pawnDoubleStep: 'fromHomeLineOnly',
  enPassant: true,
  enPassantWindow: 'oneFullRound',
  castling: true,
  castlingConsidersTeammateAttacks: false,
  promotionZone: 'farEdgeOfCentralBand',
  promotionPieces: Object.freeze(['Q', 'R', 'B', 'N']),
  promotionMandatory: true,
  promotionChoice: 'player',

  mustResolveOwnCheck: true,
  kingCaptureAllowed: false,

  eliminatedKingBehavior: 'removed',
  deadPiecesGiveCheck: false,
  deadPiecesBlock: true,
  deadPiecesCapturable: true,
  allPlayersStalemated: 'draw',

  pieceValues: DEFAULT_PIECE_VALUES,
  checkmateBonus: 20,
  stalemateBonus: 20,
  soleSurvivorBonus: 20,
  promotionBonus: 0,
  deadPieceCaptureValue: 'normal',
  resignAwardsPoints: false,
  timeControl: null,
  fiftyMoveRule: Object.freeze({ enabled: true, plyLimit: 200 }),
  threefoldRepetition: Object.freeze({ enabled: true, count: 3 }),
  insufficientMaterial: 'off',
  drawOffers: 'unanimous',
  maxMoveHistoryPlies: 2000,
  maxImportBytes: 1_000_000,
} as const satisfies Partial<RulesProfile>);
