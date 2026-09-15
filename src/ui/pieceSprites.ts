/**
 * Original piece artwork, drawn as inline SVG paths in a 100x100 box.
 *
 * These shapes were authored for this project. No third-party or proprietary
 * artwork is used anywhere (see NOTICES.md). Rendering inline means the board
 * makes no asset requests at all.
 *
 * Ownership is never communicated by fill colour alone: every piece also carries
 * an outline style and a corner tag letter, applied in CSS from `data-owner`.
 */

import type { PieceType } from '../engine/pieces.js';

const PATHS: Readonly<Record<PieceType, string>> = {
  // Pawn: round head, collar, flared body, wide base.
  P: `M50 18a13 13 0 0 1 8.4 22.9c6.5 4 10.6 10.4 11.6 18.1H30c1-7.7 5.1-14.1 11.6-18.1A13 13 0 0 1 50 18z
      M32 63h36l-3.5 12H35.5z
      M26 79h48a4 4 0 0 1 4 4v3H22v-3a4 4 0 0 1 4-4z`,

  // Rook: crenellated top, straight body, stepped base.
  R: `M24 18h11v8h9v-8h12v8h9v-8h11v20l-7 6v22l7 8v4H24v-4l7-8V44l-7-6z
      M38 46h24v26H38z
      M22 80h56a4 4 0 0 1 4 4v3H18v-3a4 4 0 0 1 4-4z`,

  // Knight: stylised horse head facing left.
  N: `M62 20c9 6 15 16 16 28l2 24H44l4-16-9 7-8-6 12-16-9 2-2-8 14-9 2-9 8 5z
      M52 34a3 3 0 1 1 0 6 3 3 0 0 1 0-6z
      M28 80h48a4 4 0 0 1 4 4v3H24v-3a4 4 0 0 1 4-4z`,

  // Bishop: mitre with a slit, collar, base.
  B: `M50 14c7 8 16 18 16 28 0 9-7 16-16 16s-16-7-16-16c0-10 9-20 16-28z
      M46 30l8 12-8 6 8 8
      M34 62h32l-3 10H37z
      M26 78h48a4 4 0 0 1 4 4v4H22v-4a4 4 0 0 1 4-4z`,

  // Queen: five-point crown over a flared body.
  Q: `M20 30l8 22 7-26 8 26 7-26 8 26 7-22 6 4-8 32H22l-8-32z
      M50 18a5 5 0 1 1 0 10 5 5 0 0 1 0-10z
      M28 62h44l-3 12H31z
      M24 80h52a4 4 0 0 1 4 4v3H20v-3a4 4 0 0 1 4-4z`,

  // King: cross above a crown and body.
  K: `M46 10h8v8h8v8h-8v8h-8v-8h-8v-8h8z
      M50 36c12 0 22 8 22 18 0 6-3 11-8 14H36c-5-3-8-8-8-14 0-10 10-18 22-18z
      M32 70h36l-3 10H35z
      M24 82h52a4 4 0 0 1 4 4v3H20v-3a4 4 0 0 1 4-4z`,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds the SVG element for a piece. The caller sets `data-owner` on the
 * wrapper; colours and outline styles come from CSS so a theme change never
 * needs a re-render.
 */
export function createPieceSvg(type: PieceType): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'piece-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[type].replace(/\s+/g, ' ').trim());
  path.setAttribute('class', 'piece-path');
  svg.appendChild(path);
  return svg;
}

/** Unicode fallback, used in the move list and captured-piece strips. */
export const PIECE_GLYPHS: Readonly<Record<PieceType, string>> = Object.freeze({
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
});
