/**
 * Online-play lobby: enter a name, host a room or join one, then claim an open
 * colour. Unlike the one-shot promises in dialogs.ts this dialog stays open
 * across asynchronous state changes (connecting, players arriving and leaving),
 * so it is driven by explicit `show*` calls rather than resolving a promise.
 */

import { COLOR_NAMES, type PlayerColor } from '../engine/pieces.js';
import type { RoomSeat } from '../multiplayer/peerTransport.js';

export interface OnlineDialogCallbacks {
  readonly onHost: (playerName: string) => void;
  readonly onJoin: (roomCode: string, playerName: string) => void;
  readonly onClaim: (color: PlayerColor) => void;
  readonly onLeave: () => void;
  readonly onClose: () => void;
}

/** Labels a seat by its team, so joiners can pick a colour to sit with a friend. */
export type TeamLabeller = (color: PlayerColor) => string | null;

export class OnlineDialog {
  #dialog: HTMLDialogElement;
  #body: HTMLDivElement;
  #error: HTMLParagraphElement;
  #callbacks: OnlineDialogCallbacks | null = null;
  #teamLabel: TeamLabeller = () => null;
  #name = '';
  #open = false;

  constructor() {
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'dialog online-dialog';
    this.#dialog.setAttribute('aria-labelledby', 'online-title');
    document.body.appendChild(this.#dialog);

    const title = document.createElement('h2');
    title.id = 'online-title';
    title.textContent = 'Play online';

    this.#body = document.createElement('div');
    this.#body.className = 'online-body';
    this.#body.setAttribute('role', 'status');

    this.#error = document.createElement('p');
    this.#error.className = 'online-error';
    this.#error.hidden = true;

    this.#dialog.append(title, this.#error, this.#body);
    this.#dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.#close();
    });
  }

  setTeamLabeller(labeller: TeamLabeller): void {
    this.#teamLabel = labeller;
  }

  /** Opens the lobby. `prefilledRoom` comes from a shared `?room=` link. */
  open(callbacks: OnlineDialogCallbacks, prefilledRoom = ''): void {
    this.#callbacks = callbacks;
    this.#showModal();
    this.showStart(prefilledRoom);
  }

  #showModal(): void {
    if (this.#open) return;
    if (typeof this.#dialog.showModal === 'function') this.#dialog.showModal();
    else this.#dialog.setAttribute('open', '');
    this.#open = true;
  }

  /** Name entry plus host-or-join. */
  showStart(prefilledRoom = ''): void {
    this.#clearError();
    this.#body.replaceChildren();

    const help = document.createElement('p');
    help.textContent = prefilledRoom
      ? 'You have been invited to a game. Enter your name to join.'
      : 'Four people, four computers, one game. Host a game and share the link, or join with a room code.';

    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'online-name-input';
    nameLabel.textContent = 'Your name';

    const nameInput = document.createElement('input');
    nameInput.id = 'online-name-input';
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.setAttribute('autocomplete', 'nickname');
    nameInput.className = 'player-name-input';
    nameInput.value = this.#name;
    nameInput.addEventListener('input', () => {
      this.#name = nameInput.value;
    });

    const codeLabel = document.createElement('label');
    codeLabel.htmlFor = 'room-code-input';
    codeLabel.textContent = 'Room code';

    const codeInput = document.createElement('input');
    codeInput.id = 'room-code-input';
    codeInput.type = 'text';
    codeInput.placeholder = 'ABC123';
    codeInput.autocapitalize = 'characters';
    codeInput.maxLength = 6;
    codeInput.className = 'room-code-input';
    codeInput.value = prefilledRoom;

    const join = document.createElement('button');
    join.type = 'button';
    join.className = prefilledRoom ? 'primary' : 'secondary';
    join.textContent = 'Join game';
    join.addEventListener('click', () => {
      const code = codeInput.value.trim();
      if (!this.#requireName(nameInput)) return;
      if (!code) {
        this.#showError('Enter the room code the host shared with you.');
        codeInput.focus();
        return;
      }
      this.#callbacks?.onJoin(code, this.#name);
    });

    const host = document.createElement('button');
    host.type = 'button';
    host.className = prefilledRoom ? 'secondary' : 'primary';
    host.textContent = 'Host a new game';
    host.addEventListener('click', () => {
      if (!this.#requireName(nameInput)) return;
      this.#callbacks?.onHost(this.#name);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.#close());

    const joinRow = document.createElement('div');
    joinRow.className = 'online-join-row';
    joinRow.append(codeInput, join);

    this.#body.append(help, nameLabel, nameInput, codeLabel, joinRow, host, cancel);
    nameInput.focus();
  }

  #requireName(input: HTMLInputElement): boolean {
    if (this.#name.trim()) return true;
    this.#showError('Enter a name so the other players know who you are.');
    input.focus();
    return false;
  }

  showConnecting(message = 'Connecting…'): void {
    this.#clearError();
    this.#body.replaceChildren();
    const p = document.createElement('p');
    p.textContent = message;
    this.#body.append(p, this.#cancelButton());
  }

  /** Host lobby: room code, shareable link and who has arrived so far. */
  showHosting(roomCode: string, joinUrl: string, seats: readonly RoomSeat[]): void {
    this.#showModal();
    this.#clearError();
    this.#body.replaceChildren();

    const help = document.createElement('p');
    help.textContent = 'Share this link with the other three players. They pick a colour when they arrive.';

    const link = document.createElement('input');
    link.type = 'text';
    link.readOnly = true;
    link.className = 'room-link-input';
    link.value = joinUrl;
    link.addEventListener('focus', () => link.select());

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(joinUrl).then(
        () => {
          copy.textContent = 'Copied';
        },
        () => {
          link.focus();
        },
      );
    });

    const codeHelp = document.createElement('p');
    codeHelp.textContent = 'Or read out the room code:';

    const code = document.createElement('p');
    code.className = 'room-code-display';
    code.textContent = roomCode;

    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'danger';
    leave.textContent = 'Close room';
    leave.addEventListener('click', () => this.#callbacks?.onLeave());

    const warning = document.createElement('p');
    warning.className = 'online-note';
    warning.textContent = 'Keep this tab open. The link stops working as soon as you close it.';

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary';
    done.textContent = 'Start playing';
    done.addEventListener('click', () => this.hide());

    this.#body.append(help, link, copy, codeHelp, code, this.#rosterList(seats), warning, done, leave);
  }

  /** Joiner lobby: the open colours, offered as buttons. */
  showSeatPicker(seats: readonly RoomSeat[]): void {
    this.#showModal();
    this.#body.replaceChildren();

    const help = document.createElement('p');
    help.textContent = 'Pick a colour. Colours already taken are shown with the player sitting there.';

    const list = document.createElement('ul');
    list.className = 'online-seats';

    for (const seat of seats) {
      const item = document.createElement('li');
      const team = this.#teamLabel(seat.color);
      const label = team ? `${COLOR_NAMES[seat.color]} (${team})` : COLOR_NAMES[seat.color];

      if (seat.name) {
        const taken = document.createElement('span');
        taken.className = 'seat-taken';
        taken.textContent = `${label} — ${seat.name}`;
        item.append(taken);
      } else {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'secondary seat-open';
        pick.dataset['color'] = seat.color;
        pick.textContent = `Play as ${label}`;
        pick.addEventListener('click', () => this.#callbacks?.onClaim(seat.color));
        item.append(pick);
      }
      list.append(item);
    }

    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'secondary';
    leave.textContent = 'Leave';
    leave.addEventListener('click', () => this.#callbacks?.onLeave());

    this.#body.append(help, list, leave);
  }

  showJoined(myColor: PlayerColor, seats: readonly RoomSeat[]): void {
    this.#clearError();
    this.#body.replaceChildren();

    const confirmed = document.createElement('p');
    confirmed.textContent = `You are playing ${COLOR_NAMES[myColor]}. Waiting for the others; you can start as soon as it is your turn.`;

    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'danger';
    leave.textContent = 'Leave game';
    leave.addEventListener('click', () => this.#callbacks?.onLeave());

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary';
    done.textContent = 'Go to the board';
    done.addEventListener('click', () => this.hide());

    this.#body.append(confirmed, this.#rosterList(seats), done, leave);
  }

  /** Refreshes the roster in place if the lobby is showing one. */
  updateRoster(seats: readonly RoomSeat[]): void {
    const existing = this.#body.querySelector('.online-roster');
    if (existing) existing.replaceWith(this.#rosterList(seats));
    const picker = this.#body.querySelector('.online-seats');
    if (picker) this.showSeatPicker(seats);
  }

  #rosterList(seats: readonly RoomSeat[]): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'online-roster';
    for (const seat of seats) {
      const item = document.createElement('li');
      const team = this.#teamLabel(seat.color);
      const label = team ? `${COLOR_NAMES[seat.color]} (${team})` : COLOR_NAMES[seat.color];
      item.textContent = seat.name ? `${label} — ${seat.name}` : `${label} — waiting for a player`;
      if (!seat.name) item.classList.add('seat-waiting');
      list.appendChild(item);
    }
    return list;
  }

  showError(message: string): void {
    this.#showModal();
    this.#showError(message);
  }

  /** An error that leaves the lobby on its start screen, so the user can retry. */
  showStartError(message: string, prefilledRoom = ''): void {
    this.#showModal();
    this.showStart(prefilledRoom);
    this.#showError(message);
  }

  #showError(message: string): void {
    this.#error.textContent = message;
    this.#error.hidden = false;
  }

  #clearError(): void {
    this.#error.textContent = '';
    this.#error.hidden = true;
  }

  #cancelButton(): HTMLButtonElement {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.#callbacks?.onLeave());
    return cancel;
  }

  /** Closes the dialog element without notifying the caller (already leaving). */
  hide(): void {
    if (!this.#open) return;
    this.#open = false;
    if (typeof this.#dialog.close === 'function') this.#dialog.close();
    else this.#dialog.removeAttribute('open');
  }

  #close(): void {
    this.hide();
    this.#callbacks?.onClose();
  }
}
