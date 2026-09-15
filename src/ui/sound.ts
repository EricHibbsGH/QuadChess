/**
 * Sound effects.
 *
 * All six cues are original WAV files stored in this repository (see
 * NOTICES.md). They are referenced with `new URL(..., import.meta.url)` so Vite
 * emits a correctly-relative URL under any GitHub Pages base path, and nothing
 * is ever fetched from a third-party origin.
 */

import type { GameEvent } from '../engine/gameState.js';

import moveUrl from '../assets/sounds/move.wav';
import captureUrl from '../assets/sounds/capture.wav';
import checkUrl from '../assets/sounds/check.wav';
import promoteUrl from '../assets/sounds/promote.wav';
import eliminateUrl from '../assets/sounds/eliminate.wav';
import gameoverUrl from '../assets/sounds/gameover.wav';

type CueName = 'move' | 'capture' | 'check' | 'promote' | 'eliminate' | 'gameover';

const SOURCES: Readonly<Record<CueName, string>> = {
  move: moveUrl,
  capture: captureUrl,
  check: checkUrl,
  promote: promoteUrl,
  eliminate: eliminateUrl,
  gameover: gameoverUrl,
};

/** Highest-priority cue wins, so a mating move does not also click. */
const PRIORITY: readonly CueName[] = ['gameover', 'eliminate', 'promote', 'check', 'capture', 'move'];

export class SoundPlayer {
  #enabled: boolean;
  #audio = new Map<CueName, HTMLAudioElement>();
  #ready = false;

  constructor(enabled: boolean) {
    this.#enabled = enabled;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (enabled) this.#prepare();
  }

  #prepare(): void {
    if (this.#ready) return;
    this.#ready = true;
    for (const [name, src] of Object.entries(SOURCES) as [CueName, string][]) {
      try {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 0.45;
        this.#audio.set(name, audio);
      } catch {
        // Audio unsupported: the game stays fully playable without it.
      }
    }
  }

  play(cue: CueName): void {
    if (!this.#enabled) return;
    this.#prepare();
    const audio = this.#audio.get(cue);
    if (!audio) return;
    try {
      audio.currentTime = 0;
      // Autoplay policies reject until the first user gesture; that is fine.
      void audio.play().catch(() => undefined);
    } catch {
      // Ignore: sound is never required for play.
    }
  }

  /** Picks the single most significant cue for a batch of engine events. */
  playForEvents(events: readonly GameEvent[]): void {
    if (!this.#enabled || events.length === 0) return;
    const present = new Set<CueName>();
    for (const event of events) {
      switch (event.kind) {
        case 'move':
          present.add('move');
          break;
        case 'capture':
          present.add('capture');
          break;
        case 'check':
          present.add('check');
          break;
        case 'promotion':
          present.add('promote');
          break;
        case 'elimination':
          present.add('eliminate');
          break;
        case 'gameEnd':
          present.add('gameover');
          break;
        default:
          break;
      }
    }
    const cue = PRIORITY.find((name) => present.has(name));
    if (cue) this.play(cue);
  }
}
