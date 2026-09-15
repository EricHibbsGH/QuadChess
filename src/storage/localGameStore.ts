/**
 * Save / resume using localStorage.
 *
 * Every read is defensive: storage can be unavailable (private mode, blocked
 * site data), full, or hold a file written by an older build. A failure here
 * never breaks the game — it just means there is nothing to resume.
 */

import { fromJson, toJson, type LoadResult } from '../engine/serialization.js';
import type { GameState } from '../engine/gameState.js';

const STORAGE_KEY = 'four-player-chess/v1/autosave';
const PREFS_KEY = 'four-player-chess/v1/prefs';

export interface Preferences {
  readonly profileId: string;
  readonly viewSeat: 'bottom' | 'left' | 'top' | 'right';
  readonly sound: boolean;
  readonly showCoordinates: boolean;
  readonly highContrast: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  profileId: 'standard-teams',
  viewSeat: 'bottom',
  sound: true,
  showCoordinates: true,
  highContrast: false,
});

function storage(): Storage | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    // Some browsers expose the object but throw on access.
    const probe = '__4pc_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function isAvailable(): boolean {
  return storage() !== null;
}

// --------------------------------------------------------------------------
// Game autosave
// --------------------------------------------------------------------------

export function saveGame(state: GameState, playerNames?: Readonly<Record<string, string>> | null): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, toJson(state, playerNames ?? null));
    return true;
  } catch {
    // Quota exceeded or storage disabled mid-session.
    return false;
  }
}

export function hasSavedGame(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Returns the validated result, or null when there is nothing stored. A stored
 * game that fails validation is reported as a failure, not silently discarded,
 * so the UI can tell the player why their game did not come back.
 */
export function loadGame(): LoadResult | null {
  const store = storage();
  if (!store) return null;
  let text: string | null = null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (text === null) return null;
  return fromJson(text);
}

export function clearGame(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do.
  }
}

// --------------------------------------------------------------------------
// Preferences
// --------------------------------------------------------------------------

export function savePreferences(prefs: Preferences): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; losing them is not an error.
  }
}

export function loadPreferences(): Preferences {
  const store = storage();
  if (!store) return DEFAULT_PREFERENCES;
  try {
    const text = store.getItem(PREFS_KEY);
    if (!text) return DEFAULT_PREFERENCES;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES;
    const record = raw as Record<string, unknown>;
    const seats = ['bottom', 'left', 'top', 'right'] as const;
    const seat = record['viewSeat'];
    return {
      profileId: typeof record['profileId'] === 'string' ? record['profileId'] : DEFAULT_PREFERENCES.profileId,
      viewSeat: (seats as readonly string[]).includes(seat as string)
        ? (seat as Preferences['viewSeat'])
        : DEFAULT_PREFERENCES.viewSeat,
      sound: typeof record['sound'] === 'boolean' ? record['sound'] : DEFAULT_PREFERENCES.sound,
      showCoordinates:
        typeof record['showCoordinates'] === 'boolean'
          ? record['showCoordinates']
          : DEFAULT_PREFERENCES.showCoordinates,
      highContrast:
        typeof record['highContrast'] === 'boolean'
          ? record['highContrast']
          : DEFAULT_PREFERENCES.highContrast,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
