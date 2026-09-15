# Notices

Every asset shipped in this repository is listed here with its origin and
licence.

## Summary

**This project contains no Chess.com artwork, source code, branding, logos,
sounds or other proprietary assets.** It contains no third-party artwork of any
kind. Nothing is loaded from a CDN or any external origin at runtime.

## Original assets created for this project

| Asset | Files | Licence |
|---|---|---|
| Piece artwork | `src/ui/pieceSprites.ts` (inline SVG path data for king, queen, rook, bishop, knight, pawn) | MIT, same as this project |
| Sound cues | `src/assets/sounds/{move,capture,check,promote,eliminate,gameover}.wav` | MIT, same as this project |
| Stylesheets | `src/ui/styles/*.css` | MIT, same as this project |
| All source code | `src/**`, `tests/**` | MIT, same as this project |

### Piece artwork

The six piece shapes are original SVG paths authored for this project and drawn
in a 100x100 box. They are rendered inline, so the board issues no image
requests. Ownership is conveyed by fill colour, by a per-player stroke pattern,
and by a tag letter, so the artwork never relies on colour alone.

### Sound cues

The six WAV files are original, generated from additive sine partials with
exponential decay envelopes and a small amount of deterministic noise. They
contain no sampled or recorded material. The generator parameters are recorded
in this repository's history; the files are checked in so the app has no build-
time dependency on audio tooling.

| File | Character | Approx. size |
|---|---|---|
| `move.wav` | soft click | 11 KB |
| `capture.wav` | lower thunk | 17 KB |
| `check.wav` | bright two-tone alert | 22 KB |
| `promote.wav` | rising chime | 36 KB |
| `eliminate.wav` | descending tone | 43 KB |
| `gameover.wav` | closing chord | 69 KB |

### Fonts

No font files are bundled. The interface uses the platform UI font stack
(`system-ui`, then `-apple-system`, `Segoe UI`, `Roboto`, `Helvetica Neue`,
`Arial`, `sans-serif`) and a generic monospace stack for the import/export box.
No font is fetched from Google Fonts or anywhere else.

### Icons

No icon font or icon library is used. The only glyphs are the standard Unicode
chess characters (U+265A to U+265F) in the captured-piece strips and move list,
which are rendered by the platform font, and plain text characters elsewhere.

## Third-party software

All third-party code is a **development dependency only**. None of it is shipped
in `dist/` as vendor code beyond what Vite emits from this project's own sources.

| Package | Purpose | Licence |
|---|---|---|
| `vite` | Build tool and dev server | MIT |
| `typescript` | Type checking | Apache-2.0 |
| `vitest` | Unit and property test runner | MIT |
| `fast-check` | Property-based testing | MIT |
| `@playwright/test` | Browser testing | Apache-2.0 |
| `jsdom` | DOM environment for tests | MIT |
| `@types/node` | Node type definitions | MIT |

Run `npm ls --all` for the full resolved tree, and `npm ls --all --long` for the
licence of every transitive dependency.

## Rules and game design

Four-player chess is a traditional chess variant. The specific rule set
implemented here is documented in `rules.md`, including every point where this
project made its own decision. Notably, the scoring table in rules.md §12.1 is
this project's own documented default, chosen for balance, and is not a
transcription of any existing product's values.

## Reference image

The reference board image supplied during development was used only to determine
the structural layout (board shape, seating of the four colours, and back-line
arrangement). No pixels, artwork or styling from it appear in this project. All
coordinates were derived formally from the rules in `rules.md` §4 rather than
measured from the image.
