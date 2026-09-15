/**
 * The board view (architecture.md §9).
 *
 * Renders the cross as an ARIA grid and reports cell activations. It holds NO
 * rule logic: it is told which squares are legal and simply draws them. Absent
 * corner cells are `role="presentation"` spacers and are never focusable.
 */

import {
  BOARD_SIZE,
  isLightSquare,
  isPlayable,
  rotateForSeat,
  toNotation,
  unrotateForSeat,
  type Coord,
  type Seat,
} from '../engine/coordinates.js';
import { pieceAt } from '../engine/board.js';
import { COLOR_NAMES, COLOR_TAGS, type PlayerColor } from '../engine/pieces.js';
import type { GameState } from '../engine/gameState.js';
import type { Move } from '../engine/movement.js';
import { createPieceSvg } from './pieceSprites.js';
import { describeSquare } from './accessibility.js';

export interface BoardModel {
  readonly state: GameState;
  readonly selected: Coord | null;
  /** Legal moves from the selected square, supplied by the controller. */
  readonly moves: readonly Move[];
  readonly lastMove: Move | null;
  readonly checked: readonly PlayerColor[];
  readonly viewSeat: Seat;
  readonly showCoordinates: boolean;
  readonly interactive: boolean;
}

export interface BoardViewCallbacks {
  /** A cell was clicked, tapped, or activated with Enter/Space. */
  readonly onActivate: (coord: Coord) => void;
  /** Escape was pressed inside the board. */
  readonly onCancel: () => void;
}

interface CellRef {
  readonly element: HTMLDivElement;
  readonly tag: HTMLSpanElement;
  readonly marker: HTMLSpanElement;
  readonly label: HTMLSpanElement;
  /** Engine coordinate currently displayed in this view position. */
  coord: Coord;
  pieceKey: string;
}

export class BoardView {
  #root: HTMLElement;
  #grid: HTMLDivElement;
  #callbacks: BoardViewCallbacks;
  /** Indexed by VIEW position `r * 14 + c`; absent positions hold null. */
  #cells: (CellRef | null)[] = new Array(BOARD_SIZE * BOARD_SIZE).fill(null);
  #focusView: Coord = { r: 13, c: 7 };
  #viewSeat: Seat = 'bottom';

  constructor(root: HTMLElement, callbacks: BoardViewCallbacks) {
    this.#root = root;
    this.#callbacks = callbacks;
    this.#grid = document.createElement('div');
    this.#grid.className = 'board-grid';
    this.#grid.setAttribute('role', 'grid');
    this.#grid.setAttribute('aria-label', 'Four-player chess board, 14 by 14 with the four corners removed');
    this.#build();
    this.#root.appendChild(this.#grid);
    this.#grid.addEventListener('click', this.#handleClick);
    this.#grid.addEventListener('keydown', this.#handleKeydown);
  }

  #build(): void {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.setAttribute('role', 'row');

      for (let c = 0; c < BOARD_SIZE; c += 1) {
        // A view position is playable exactly when the engine square it shows is:
        // every rotation is a symmetry of the cross.
        if (!isPlayable(r, c)) {
          const gap = document.createElement('div');
          gap.className = 'cell absent';
          gap.setAttribute('role', 'presentation');
          row.appendChild(gap);
          continue;
        }

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;
        cell.dataset['vr'] = String(r);
        cell.dataset['vc'] = String(c);
        cell.classList.add(isLightSquare({ r, c }) ? 'light' : 'dark');

        const label = document.createElement('span');
        label.className = 'coord-label';
        cell.appendChild(label);

        const tag = document.createElement('span');
        tag.className = 'owner-tag';
        tag.setAttribute('aria-hidden', 'true');
        cell.appendChild(tag);

        const marker = document.createElement('span');
        marker.className = 'marker';
        marker.setAttribute('aria-hidden', 'true');
        cell.appendChild(marker);

        row.appendChild(cell);
        this.#cells[r * BOARD_SIZE + c] = {
          element: cell,
          tag,
          marker,
          label,
          coord: { r, c },
          pieceKey: '',
        };
      }
      this.#grid.appendChild(row);
    }
  }

  // ------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------

  render(model: BoardModel): void {
    this.#viewSeat = model.viewSeat;
    const { state } = model;

    const targets = new Map<number, Move>();
    for (const move of model.moves) {
      targets.set(move.to.r * BOARD_SIZE + move.to.c, move);
    }

    const checkedKings = new Set<number>();
    for (const color of model.checked) {
      for (let i = 0; i < state.board.length; i += 1) {
        const piece = state.board[i];
        if (piece?.type === 'K' && piece.owner === color && !piece.dead) checkedKings.add(i);
      }
    }

    for (let vr = 0; vr < BOARD_SIZE; vr += 1) {
      for (let vc = 0; vc < BOARD_SIZE; vc += 1) {
        const ref = this.#cells[vr * BOARD_SIZE + vc];
        if (!ref) continue;

        const coord = unrotateForSeat({ r: vr, c: vc }, model.viewSeat);
        ref.coord = coord;
        const index = coord.r * BOARD_SIZE + coord.c;
        const piece = pieceAt(state.board, coord);

        // Square shading follows the ENGINE square so the pattern is stable
        // under rotation.
        ref.element.classList.toggle('light', isLightSquare(coord));
        ref.element.classList.toggle('dark', !isLightSquare(coord));

        const target = targets.get(index);
        const isSelected =
          model.selected !== null && model.selected.r === coord.r && model.selected.c === coord.c;
        const isLastMove =
          model.lastMove !== null &&
          ((model.lastMove.from.r === coord.r && model.lastMove.from.c === coord.c) ||
            (model.lastMove.to.r === coord.r && model.lastMove.to.c === coord.c));
        const isCheckedKing = checkedKings.has(index);

        ref.element.classList.toggle('selected', isSelected);
        ref.element.classList.toggle('target', target !== undefined && !target.capture);
        ref.element.classList.toggle('capture-target', target !== undefined && Boolean(target.capture));
        ref.element.classList.toggle('last-move', isLastMove);
        ref.element.classList.toggle('in-check', isCheckedKing);
        ref.element.classList.toggle('occupied', piece !== null);
        ref.element.classList.toggle('dead', piece?.dead === true);

        // Piece sprite: only rebuilt when the occupant actually changes.
        const key = piece ? `${piece.owner}${piece.type}${piece.dead ? 'd' : ''}` : '';
        if (key !== ref.pieceKey) {
          ref.element.querySelector('.piece-svg')?.remove();
          if (piece) {
            const svg = createPieceSvg(piece.type);
            ref.element.insertBefore(svg, ref.marker);
          }
          ref.pieceKey = key;
        }
        if (piece) {
          ref.element.dataset['owner'] = piece.owner;
          ref.tag.textContent = COLOR_TAGS[piece.owner];
        } else {
          delete ref.element.dataset['owner'];
          ref.tag.textContent = '';
        }

        ref.label.textContent = model.showCoordinates ? toNotation(coord) : '';

        ref.element.setAttribute(
          'aria-label',
          describeSquare(coord, {
            piece,
            isSelected,
            isLegalTarget: target !== undefined,
            isCapture: target !== undefined && Boolean(target.capture),
            isLastMove,
            isCheckedKing,
          }),
        );
        ref.element.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        ref.element.setAttribute('aria-disabled', model.interactive ? 'false' : 'true');
      }
    }

    this.#applyRovingTabindex();
  }

  // ------------------------------------------------------------------------
  // Focus management
  // ------------------------------------------------------------------------

  #applyRovingTabindex(): void {
    const focused = this.#cellAtView(this.#focusView);
    if (!focused) {
      // The focus square is never absent, but recover if it somehow is.
      this.#focusView = { r: 13, c: 7 };
    }
    for (const ref of this.#cells) {
      if (!ref) continue;
      const isFocus =
        ref.element.dataset['vr'] === String(this.#focusView.r) &&
        ref.element.dataset['vc'] === String(this.#focusView.c);
      ref.element.tabIndex = isFocus ? 0 : -1;
    }
  }

  #cellAtView(view: Coord): CellRef | null {
    if (view.r < 0 || view.r >= BOARD_SIZE || view.c < 0 || view.c >= BOARD_SIZE) return null;
    return this.#cells[view.r * BOARD_SIZE + view.c] ?? null;
  }

  /** Moves keyboard focus to an engine coordinate, e.g. after a move is made. */
  focusCoord(coord: Coord): void {
    const view = rotateForSeat(coord, this.#viewSeat);
    const ref = this.#cellAtView(view);
    if (!ref) return;
    this.#focusView = view;
    this.#applyRovingTabindex();
    ref.element.focus();
  }

  /** Moves focus by one step in view space, skipping absent cells. */
  #moveFocus(dr: number, dc: number): void {
    let { r, c } = this.#focusView;
    for (let step = 0; step < BOARD_SIZE; step += 1) {
      r += dr;
      c += dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return; // edge: stay put
      const ref = this.#cellAtView({ r, c });
      if (ref) {
        this.#focusView = { r, c };
        this.#applyRovingTabindex();
        ref.element.focus();
        return;
      }
      // Absent cell: keep stepping in the same direction.
    }
  }

  #moveToRowEdge(direction: -1 | 1): void {
    const { r } = this.#focusView;
    const start = direction === 1 ? BOARD_SIZE - 1 : 0;
    for (let i = start; i >= 0 && i < BOARD_SIZE; i -= direction) {
      const ref = this.#cellAtView({ r, c: i });
      if (ref) {
        this.#focusView = { r, c: i };
        this.#applyRovingTabindex();
        ref.element.focus();
        return;
      }
    }
  }

  // ------------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------------

  #handleClick = (event: MouseEvent): void => {
    const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cell[role="gridcell"]');
    if (!cell) return;
    const view = this.#viewOf(cell);
    if (!view) return;
    this.#focusView = view;
    this.#applyRovingTabindex();
    const ref = this.#cellAtView(view);
    if (ref) this.#callbacks.onActivate(ref.coord);
  };

  #handleKeydown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowUp':
        this.#moveFocus(-1, 0);
        break;
      case 'ArrowDown':
        this.#moveFocus(1, 0);
        break;
      case 'ArrowLeft':
        this.#moveFocus(0, -1);
        break;
      case 'ArrowRight':
        this.#moveFocus(0, 1);
        break;
      case 'Home':
        this.#moveToRowEdge(-1);
        break;
      case 'End':
        this.#moveToRowEdge(1);
        break;
      case 'Enter':
      case ' ': {
        const ref = this.#cellAtView(this.#focusView);
        if (ref) this.#callbacks.onActivate(ref.coord);
        break;
      }
      case 'Escape':
        this.#callbacks.onCancel();
        break;
      default:
        return; // let the key through
    }
    event.preventDefault();
  };

  #viewOf(cell: HTMLElement): Coord | null {
    const r = Number(cell.dataset['vr']);
    const c = Number(cell.dataset['vc']);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
    return { r, c };
  }

  /** Short description of the current orientation, for the status panel. */
  static orientationLabel(seat: Seat, seating: Readonly<Record<PlayerColor, Seat>>): string {
    const color = (Object.keys(seating) as PlayerColor[]).find((key) => seating[key] === seat);
    return color ? `${COLOR_NAMES[color]} at the bottom` : 'Default orientation';
  }
}
