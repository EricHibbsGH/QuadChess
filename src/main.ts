/**
 * Composition root: wires the engine, the views, the transport and storage.
 *
 * All game logic lives in `src/engine`. This file decides what to show and what
 * to send; it never decides what is legal.
 */

import './ui/styles/base.css';
import './ui/styles/board.css';
import './ui/styles/panels.css';

import { coordsEqual, type Coord, type Seat } from './engine/coordinates.js';
import { pieceAt } from './engine/board.js';
import { COLOR_NAMES, type PieceType, type PlayerColor } from './engine/pieces.js';
import {
  legalDestinations,
  playersInCheck,
  type GameEvent,
  type MoveOutcome,
} from './engine/gameState.js';
import { GameSession } from './engine/session.js';
import { fromJson, toJson } from './engine/serialization.js';
import type { Move } from './engine/movement.js';
import { defaultProfile, getProfile, PROFILES } from './rules/index.js';

import { BoardView } from './ui/boardView.js';
import { Controls, type OnlineRole } from './ui/controls.js';
import { StatusPanel } from './ui/statusPanel.js';
import { MoveList } from './ui/moveList.js';
import { Dialogs } from './ui/dialogs.js';
import { OnlineDialog } from './ui/onlineDialog.js';
import { Announcer, describeEvents, describeTurn } from './ui/accessibility.js';
import { SoundPlayer } from './ui/sound.js';
import { LocalTransport } from './multiplayer/localTransport.js';
import { PeerTransport, type RoomEvent } from './multiplayer/peerTransport.js';
import type { MoveIntent, Transport } from './multiplayer/transport.js';
import {
  clearGame,
  loadGame,
  loadPreferences,
  saveGame,
  savePreferences,
  type Preferences,
} from './storage/localGameStore.js';

const SEAT_CYCLE: readonly Seat[] = ['bottom', 'left', 'top', 'right'];

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id} in index.html`);
  return element;
}

class App {
  #session: GameSession;
  #prefs: Preferences;

  #board: BoardView;
  #controls: Controls;
  #status: StatusPanel;
  #moves: MoveList;
  #dialogs = new Dialogs();
  #onlineDialog = new OnlineDialog();
  #announcer: Announcer;
  #sound: SoundPlayer;
  #transport: Transport = new LocalTransport();
  #unbindTransport: () => void;

  /** Non-null only while connected to a room; the colour this device controls. */
  #myColor: PlayerColor | null = null;
  /** Colours claimed by OTHER peers in the current room; never includes `#myColor`. */
  #remoteColors = new Set<PlayerColor>();
  #onlineRole: OnlineRole = 'offline';

  #selected: Coord | null = null;
  #selectedMoves: readonly Move[] = [];
  #lastMove: Move | null = null;
  /** Guards against re-entrancy while the promotion dialog is open. */
  #busy = false;

  constructor() {
    this.#prefs = loadPreferences();
    const profile = getProfile(this.#prefs.profileId) ?? defaultProfile();

    const restored = loadGame();
    if (restored?.ok) {
      this.#session = new GameSession(restored.profile, restored.states);
      this.#prefs = { ...this.#prefs, profileId: restored.profile.id };
    } else {
      this.#session = new GameSession(profile);
      if (restored && !restored.ok) clearGame();
    }

    this.#announcer = new Announcer(requireElement('live-polite'), requireElement('live-assertive'));
    this.#sound = new SoundPlayer(this.#prefs.sound);

    this.#board = new BoardView(requireElement('board'), {
      onActivate: (coord) => void this.#activate(coord),
      onCancel: () => this.#clearSelection(),
    });

    this.#status = new StatusPanel(requireElement('status'), this.#session.profile);
    this.#moves = new MoveList(requireElement('moves'));

    this.#controls = new Controls(requireElement('controls'), {
      onNewGame: () => void this.#newGame(),
      onProfileChange: (id) => void this.#changeProfile(id),
      onRotate: () => this.#rotate(),
      onToggleSound: (enabled) => this.#setSound(enabled),
      onToggleCoordinates: (enabled) => this.#setCoordinates(enabled),
      onUndo: () => this.#undo(),
      onRedo: () => this.#redo(),
      onResign: () => void this.#resign(),
      onDraw: () => void this.#offerDraw(),
      onTransfer: () => void this.#transfer(),
      onOnline: () => this.#toggleOnline(),
    });

    // Everything a player does goes out through the transport and comes back in
    // through this handler, so swapping in a networked transport changes nothing else.
    this.#unbindTransport = this.#transport.onRemote((intent) => this.#applyIntent(intent));

    if (restored?.ok) {
      this.#announcer.say('Saved game restored.');
    }
    this.#render();

    const roomFromUrl = new URLSearchParams(window.location.search).get('room');
    if (roomFromUrl) void this.#joinOnline(roomFromUrl);
  }

  // ----------------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------------

  #render(): void {
    const state = this.#session.state;
    const profile = this.#session.profile;
    const checked = playersInCheck(state, profile);

    this.#board.render({
      state,
      selected: this.#selected,
      moves: this.#selectedMoves,
      lastMove: this.#lastMove,
      checked,
      viewSeat: this.#prefs.viewSeat,
      showCoordinates: this.#prefs.showCoordinates,
      interactive: state.result === null,
    });

    this.#status.render({ state, profile, checked, playerNames: {} });
    this.#moves.render(state, profile);
    this.#controls.render({
      profile,
      canUndo: this.#session.canUndo,
      canRedo: this.#session.canRedo,
      finished: state.result !== null,
      sound: this.#prefs.sound,
      showCoordinates: this.#prefs.showCoordinates,
      viewSeat: this.#prefs.viewSeat,
      orientationLabel: BoardView.orientationLabel(this.#prefs.viewSeat, profile.seating),
      onlineRole: this.#onlineRole,
    });

    document.body.dataset['turn'] = state.toMove;
    document.body.dataset['finished'] = state.result ? 'true' : 'false';
  }

  // ----------------------------------------------------------------------
  // Board interaction
  // ----------------------------------------------------------------------

  async #activate(coord: Coord): Promise<void> {
    if (this.#busy) return;
    const state = this.#session.state;
    if (state.result) {
      this.#announcer.alert('The game is over. Start a new game to keep playing.');
      return;
    }

    // Completing a move onto a highlighted destination.
    if (this.#selected) {
      const matches = this.#selectedMoves.filter((move) => coordsEqual(move.to, coord));
      if (matches.length > 0) {
        const from = this.#selected;
        let promotion: PieceType | null = matches[0]?.promotion ?? null;

        if (matches.length > 1 && matches.every((move) => move.promotion !== null)) {
          this.#busy = true;
          try {
            promotion = await this.#dialogs.choosePromotion(
              state.toMove,
              matches.map((move) => move.promotion).filter((value): value is PieceType => value !== null),
            );
          } finally {
            this.#busy = false;
          }
          if (promotion === null) return; // player backed out; nothing happens
        }

        this.#clearSelection();
        void this.#transport.send({ kind: 'move', color: state.toMove, from, to: coord, promotion });
        return;
      }
    }

    // Otherwise: select, reselect or clear.
    const piece = pieceAt(state.board, coord);
    if (piece && piece.owner === state.toMove && !piece.dead && !this.#remoteColors.has(piece.owner)) {
      this.#selected = coord;
      this.#selectedMoves = legalDestinations(state, this.#session.profile, coord);
      this.#render();
      this.#announcer.say(
        this.#selectedMoves.length === 0
          ? `${COLOR_NAMES[piece.owner]} ${piece.type === 'P' ? 'pawn' : piece.type} selected, no legal moves.`
          : `Selected. ${this.#selectedMoves.length} legal ${this.#selectedMoves.length === 1 ? 'move' : 'moves'}.`,
      );
      return;
    }

    if (piece && piece.owner !== state.toMove) {
      this.#announcer.alert(`That is ${COLOR_NAMES[piece.owner]}'s piece. ${COLOR_NAMES[state.toMove]} to move.`);
    } else if (piece && this.#remoteColors.has(piece.owner)) {
      this.#announcer.alert(`${COLOR_NAMES[piece.owner]} is playing on another computer.`);
    }
    this.#clearSelection();
  }

  #clearSelection(): void {
    if (this.#selected === null && this.#selectedMoves.length === 0) return;
    this.#selected = null;
    this.#selectedMoves = [];
    this.#render();
  }

  // ----------------------------------------------------------------------
  // Intents
  // ----------------------------------------------------------------------

  #applyIntent(intent: MoveIntent): void {
    if (intent.kind === 'reset') {
      const profile = getProfile(intent.profileId) ?? this.#session.profile;
      this.#session.reset(profile);
      this.#prefs = { ...this.#prefs, profileId: profile.id };
      savePreferences(this.#prefs);
      this.#status.rebuild(profile);
      this.#resetViewState();
      this.#announcer.say(`${profile.label}. ${describeTurn(this.#session.state.toMove, false)}`);
      return;
    }

    let outcome: MoveOutcome;
    switch (intent.kind) {
      case 'move':
        outcome = this.#session.move({
          from: intent.from,
          to: intent.to,
          promotion: intent.promotion ?? null,
        });
        break;
      case 'resign':
        outcome = this.#session.resign(intent.color);
        break;
      case 'timeout':
        outcome = this.#session.timeout(intent.color);
        break;
      case 'draw':
        outcome = this.#session.agreeDraw();
        break;
    }

    if (!outcome.ok) {
      this.#announcer.alert(outcome.detail);
      this.#render();
      return;
    }

    this.#lastMove = outcome.record.kind === 'move' ? outcome.record.move : null;
    this.#afterChange(outcome.events);
  }

  #afterChange(events: readonly GameEvent[]): void {
    this.#selected = null;
    this.#selectedMoves = [];
    this.#render();

    this.#sound.playForEvents(events);

    const state = this.#session.state;
    const spoken = describeEvents(events);
    const turn = state.result ? '' : ` ${describeTurn(state.toMove, playersInCheck(state, this.#session.profile).includes(state.toMove))}`;
    this.#announcer.say(`${spoken}${turn}`);

    saveGame(state);
  }

  // ----------------------------------------------------------------------
  // Controls
  // ----------------------------------------------------------------------

  async #newGame(): Promise<void> {
    if (this.#session.state.history.length > 0) {
      const confirmed = await this.#dialogs.confirm({
        title: 'Start a new game?',
        body: 'The current game will be discarded. This cannot be undone.',
        confirmLabel: 'Start new game',
        danger: true,
      });
      if (!confirmed) return;
    }
    void this.#transport.send({ kind: 'reset', profileId: this.#session.profile.id });
  }

  async #changeProfile(profileId: string): Promise<void> {
    const profile = getProfile(profileId);
    if (!profile || profile.id === this.#session.profile.id) {
      this.#render();
      return;
    }
    if (this.#session.state.history.length > 0) {
      const confirmed = await this.#dialogs.confirm({
        title: `Switch to ${profile.label}?`,
        body: 'Changing the rules profile starts a new game. The current game will be discarded.',
        confirmLabel: 'Switch and restart',
        danger: true,
      });
      if (!confirmed) {
        this.#render();
        return;
      }
    }
    void this.#transport.send({ kind: 'reset', profileId: profile.id });
  }

  #resetViewState(): void {
    this.#selected = null;
    this.#selectedMoves = [];
    this.#lastMove = null;
    this.#moves.clear();
    clearGame();
    this.#render();
    saveGame(this.#session.state);
  }

  #rotate(): void {
    const index = SEAT_CYCLE.indexOf(this.#prefs.viewSeat);
    const next = SEAT_CYCLE[(index + 1) % SEAT_CYCLE.length] ?? 'bottom';
    this.#prefs = { ...this.#prefs, viewSeat: next };
    savePreferences(this.#prefs);
    this.#render();
    this.#announcer.say(BoardView.orientationLabel(next, this.#session.profile.seating));
  }

  #setSound(enabled: boolean): void {
    this.#prefs = { ...this.#prefs, sound: enabled };
    this.#sound.setEnabled(enabled);
    savePreferences(this.#prefs);
    this.#render();
  }

  #setCoordinates(enabled: boolean): void {
    this.#prefs = { ...this.#prefs, showCoordinates: enabled };
    savePreferences(this.#prefs);
    this.#render();
  }

  #undo(): void {
    if (!this.#session.undo()) return;
    this.#lastMove = null;
    this.#selected = null;
    this.#selectedMoves = [];
    this.#render();
    saveGame(this.#session.state);
    this.#announcer.say(`Move undone. ${describeTurn(this.#session.state.toMove, false)}`);
  }

  #redo(): void {
    if (!this.#session.redo()) return;
    this.#lastMove = null;
    this.#selected = null;
    this.#selectedMoves = [];
    this.#render();
    saveGame(this.#session.state);
    this.#announcer.say(`Move redone. ${describeTurn(this.#session.state.toMove, false)}`);
  }

  async #resign(): Promise<void> {
    const state = this.#session.state;
    if (state.result) return;
    const color = state.toMove;
    if (this.#remoteColors.has(color)) {
      this.#announcer.alert(`${COLOR_NAMES[color]} is playing on another computer.`);
      return;
    }
    const confirmed = await this.#dialogs.confirm({
      title: `${COLOR_NAMES[color]}, resign?`,
      body:
        this.#session.profile.onResign === 'teamLoses'
          ? 'Resigning ends the game and loses it for your team.'
          : 'Resigning removes you from the game. Your remaining pieces stay on the board.',
      confirmLabel: 'Resign',
      danger: true,
    });
    if (!confirmed) return;
    void this.#transport.send({ kind: 'resign', color });
  }

  async #offerDraw(): Promise<void> {
    const state = this.#session.state;
    if (state.result) return;
    if (this.#remoteColors.has(state.toMove)) {
      this.#announcer.alert(`${COLOR_NAMES[state.toMove]} is playing on another computer.`);
      return;
    }
    const remaining = state.active.map((color) => COLOR_NAMES[color]).join(', ');
    const confirmed = await this.#dialogs.confirm({
      title: 'Agree a draw?',
      body: `All remaining players (${remaining}) must agree. Confirm only if everyone has said yes.`,
      confirmLabel: 'Agree draw',
    });
    if (!confirmed) return;
    void this.#transport.send({ kind: 'draw', color: state.toMove });
  }

  async #transfer(): Promise<void> {
    if (this.#onlineRole !== 'offline') {
      this.#announcer.alert('Save / load is not available while playing online.');
      return;
    }
    const current = toJson(this.#session.state);
    const text = await this.#dialogs.transfer(current);
    if (text === null || text === current) return;

    const result = fromJson(text, { maxBytes: this.#session.profile.maxImportBytes });
    if (!result.ok) {
      await this.#dialogs.message('That game could not be loaded', result.reason);
      this.#announcer.alert(`Import rejected: ${result.reason}`);
      return;
    }

    this.#session.reset(result.profile, result.states);
    this.#prefs = { ...this.#prefs, profileId: result.profile.id };
    savePreferences(this.#prefs);
    this.#status.rebuild(result.profile);
    this.#selected = null;
    this.#selectedMoves = [];
    this.#lastMove = null;
    this.#moves.clear();
    this.#render();
    saveGame(this.#session.state);
    this.#announcer.say(`Game loaded. ${describeTurn(this.#session.state.toMove, false)}`);
  }

  // ----------------------------------------------------------------------
  // Online play (multiplayer/peerTransport.ts)
  // ----------------------------------------------------------------------

  #toggleOnline(): void {
    if (this.#onlineRole === 'offline') {
      this.#onlineDialog.open({
        onHost: () => void this.#hostOnline(),
        onJoin: (code) => void this.#joinOnline(code),
        onLeave: () => this.#leaveOnline(),
        onClose: () => {},
      });
    } else {
      this.#leaveOnline();
    }
  }

  /** Replaces the active transport, moving the intent subscription across. */
  #bindTransport(transport: Transport): void {
    this.#unbindTransport();
    this.#transport.close();
    this.#transport = transport;
    this.#unbindTransport = this.#transport.onRemote((intent) => this.#applyIntent(intent));
  }

  async #hostOnline(): Promise<void> {
    this.#onlineDialog.showConnecting();
    try {
      const { transport, roomCode } = await PeerTransport.host({
        seats: this.#session.profile.turnOrder,
        onRoomEvent: (event) => this.#handleRoomEvent(event),
        getSyncPayload: () => toJson(this.#session.state),
      });
      this.#bindTransport(transport);
      this.#myColor = this.#session.profile.turnOrder[0] ?? null;
      this.#remoteColors = new Set();
      this.#onlineRole = 'host';
      // Online play needs every peer starting from the same position.
      void this.#transport.send({ kind: 'reset', profileId: this.#session.profile.id });

      const joinUrl = new URL(window.location.href);
      joinUrl.search = `?room=${roomCode}`;
      this.#onlineDialog.showHosting(roomCode, joinUrl.toString());
      this.#render();
    } catch {
      this.#onlineDialog.showError('Could not start a room. Check your connection and try again.');
    }
  }

  async #joinOnline(roomCode: string): Promise<void> {
    this.#onlineDialog.showConnecting();
    try {
      const transport = await PeerTransport.join(roomCode, {
        seats: this.#session.profile.turnOrder,
        onRoomEvent: (event) => this.#handleRoomEvent(event),
        onSync: (json) => this.#applySync(json),
      });
      this.#bindTransport(transport);
      this.#onlineRole = 'joiner';
      this.#render();
    } catch {
      this.#onlineDialog.showError('Could not join that room. Check the code and try again.');
    }
  }

  /** Applies the host's game snapshot on connecting. Trusted: it came from the host, not a paste box. */
  #applySync(json: string): void {
    const result = fromJson(json, { maxBytes: this.#session.profile.maxImportBytes * 4 });
    if (!result.ok) return;
    this.#session.reset(result.profile, result.states);
    this.#prefs = { ...this.#prefs, profileId: result.profile.id };
    savePreferences(this.#prefs);
    this.#status.rebuild(result.profile);
    this.#resetViewState();
  }

  #leaveOnline(): void {
    if (this.#onlineRole === 'offline') return;
    this.#bindTransport(new LocalTransport());
    this.#myColor = null;
    this.#remoteColors = new Set();
    this.#onlineRole = 'offline';
    this.#onlineDialog.hide();
    this.#render();
    this.#announcer.say('Left the online game. Playing locally.');
  }

  #handleRoomEvent(event: RoomEvent): void {
    switch (event.kind) {
      case 'assigned':
        this.#myColor = event.color;
        this.#onlineDialog.showJoined(event.color);
        this.#announcer.say(`Connected. You are playing ${COLOR_NAMES[event.color]}.`);
        break;
      case 'roster':
        this.#remoteColors = new Set(event.colors.filter((color) => color !== this.#myColor));
        this.#onlineDialog.updateRoster(event.colors);
        this.#render();
        break;
      case 'peerLeft':
        this.#announcer.alert('A player disconnected. The game continues; they can rejoin with the same room code.');
        break;
      case 'disconnected':
        this.#announcer.alert(event.reason);
        this.#leaveOnline();
        break;
    }
  }
}

function start(): void {
  try {
    const app = new App();
    // Expose nothing except a marker the browser tests can wait on.
    document.body.dataset['ready'] = 'true';
    void app;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = document.getElementById('board');
    if (fallback) fallback.textContent = `The board could not start: ${message}`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

export { PROFILES };
