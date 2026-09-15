/**
 * Undo / redo for local games.
 *
 * Every ply's immutable GameState is kept, so undo is a pointer move rather than
 * an inverse-move computation — which is what makes undo exact across captures,
 * promotion, elimination and scoring. The buffer is bounded by
 * `maxMoveHistoryPlies` (INV-7).
 */

import {
  applyMove,
  agreeDraw,
  createGame,
  resign,
  timeout,
  type GameEvent,
  type GameState,
  type MoveOutcome,
  type MoveRequest,
} from './gameState.js';
import type { RulesProfile } from '../rules/types.js';
import type { PlayerColor } from './pieces.js';

export class GameSession {
  #profile: RulesProfile;
  #states: GameState[];
  #index: number;

  constructor(profile: RulesProfile, states?: readonly GameState[]) {
    this.#profile = profile;
    const initial = states && states.length > 0 ? [...states] : [createGame(profile)];
    this.#states = initial;
    this.#index = initial.length - 1;
  }

  get profile(): RulesProfile {
    return this.#profile;
  }

  get state(): GameState {
    const state = this.#states[this.#index];
    if (!state) throw new Error('session has no state');
    return state;
  }

  get canUndo(): boolean {
    return this.#index > 0;
  }

  get canRedo(): boolean {
    return this.#index < this.#states.length - 1;
  }

  /** Number of plies that can still be undone. */
  get depth(): number {
    return this.#index;
  }

  #commit(outcome: MoveOutcome): MoveOutcome {
    if (!outcome.ok) return outcome;
    // A new action discards any redo branch.
    this.#states = this.#states.slice(0, this.#index + 1);
    this.#states.push(outcome.state);
    const limit = this.#profile.maxMoveHistoryPlies + 1;
    if (this.#states.length > limit) {
      this.#states = this.#states.slice(this.#states.length - limit);
    }
    this.#index = this.#states.length - 1;
    return outcome;
  }

  move(request: MoveRequest): MoveOutcome {
    return this.#commit(applyMove(this.state, this.#profile, request));
  }

  resign(color: PlayerColor): MoveOutcome {
    return this.#commit(resign(this.state, this.#profile, color));
  }

  timeout(color: PlayerColor): MoveOutcome {
    return this.#commit(timeout(this.state, this.#profile, color));
  }

  agreeDraw(): MoveOutcome {
    return this.#commit(agreeDraw(this.state, this.#profile));
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.#index -= 1;
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.#index += 1;
    return true;
  }

  /** Replaces the whole session, e.g. after a successful import. */
  reset(profile: RulesProfile, states?: readonly GameState[]): void {
    this.#profile = profile;
    const initial = states && states.length > 0 ? [...states] : [createGame(profile)];
    this.#states = initial;
    this.#index = initial.length - 1;
  }

  /** All states up to and including the current one, for saving. */
  timeline(): readonly GameState[] {
    return this.#states.slice(0, this.#index + 1);
  }

  /** Events are not replayed by undo; the UI re-renders from state instead. */
  static eventsOf(outcome: MoveOutcome): readonly GameEvent[] {
    return outcome.ok ? outcome.events : [];
  }
}
