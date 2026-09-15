# Architecture

**Status:** Implemented. This document describes the code as it stands.

Companion to [rules.md](rules.md), which owns every rule decision. This document
owns structure, data flow, module boundaries, tooling and deployment.

---

## 1. Principles

1. **The engine never touches the DOM.** `src/engine/**` and `src/rules/**` import
   nothing from `src/ui/**`, have no browser globals, and are testable in isolation.
   Legal moves are never derived from HTML elements or CSS classes.
2. **Rules are data, not code paths.** Every ambiguous behaviour is a field on a
   `RulesProfile` object. Adding a variant means adding data, not `if` branches.
3. **State transitions are pure.** `applyMove(state, move) -> MoveResult` returns a
   new state; the input is never mutated (INV-9). `Object.freeze` in dev builds.
4. **One topology predicate.** Nothing computes corner exclusion inline.
5. **Untrusted input stops at the boundary.** Imported JSON is validated by a
   schema before it becomes a `GameState`; strings are escaped at render time.

---

## 2. File tree

```
QuadChess/
|- .github/workflows/deploy.yml   # typecheck -> test -> build -> e2e -> Pages
|- public/.nojekyll               # stops Pages mangling _-prefixed asset names
|- src/
|  |- engine/                     # pure rules. No DOM, no browser globals.
|  |  |- coordinates.ts           # Coord, isPlayable, notation, regions, per-seat
|  |  |                           #   geometry, rotateForSeat (UI-only helper)
|  |  |- pieces.ts                # PlayerColor, PieceType, Piece, names and tags
|  |  |- board.ts                 # flat 196-cell board, initialBoard, castlePlans
|  |  |- movement.ts              # pseudo-legal generation + attack squares
|  |  |- attacks.ts               # isSquareAttackedBy (reverse scan), attacker sets
|  |  |- check.ts                 # isInCheck, checkersOf, terminal classification
|  |  |- legalMoves.ts            # legality filter, castling, applyMoveToBoard
|  |  |- turnOrder.ts             # rotation computed from the ACTIVE set
|  |  |- elimination.ts           # retire pieces, dead pieces, result evaluation
|  |  |- scoring.ts               # point events, totals, rankings
|  |  |- notation.ts              # long algebraic, parse and describe
|  |  |- gameState.ts             # GameState, the 9-step pipeline, turn settlement
|  |  |- session.ts               # undo/redo over immutable per-ply states
|  |  \- serialization.ts         # save/load: replay + snapshot verification
|  |- rules/                      # profiles are DATA, not code paths
|  |  |- types.ts                 # RulesProfile (the rules.md §13 matrix, typed)
|  |  |- teams.ts                 # standard-teams, standard-teams-classic
|  |  |- freeForAll.ts            # standard-ffa
|  |  \- index.ts                 # registry + rules-version gate
|  |- ui/                         # DOM only. Never decides legality.
|  |  |- boardView.ts             # ARIA grid, roving focus, highlights
|  |  |- controls.ts              # toolbar
|  |  |- statusPanel.ts           # turn, players, scores, captures, result
|  |  |- moveList.ts              # semantic <ol>, one item per round
|  |  |- dialogs.ts               # <dialog>-based modals; no alert/confirm/prompt
|  |  |- accessibility.ts         # square descriptions + live-region announcer
|  |  |- pieceSprites.ts          # original inline SVG piece artwork
|  |  |- sound.ts                 # local WAV cues, priority selection
|  |  \- styles/{base,board,panels}.css
|  |- storage/localGameStore.ts   # localStorage autosave + preferences
|  |- multiplayer/
|  |  |- transport.ts             # the seam
|  |  \- localTransport.ts        # pass-and-play; the only transport that exists
|  |- assets/sounds/*.wav         # six original cues
|  \- main.ts                     # composition root
|- tests/
|  |- support/fixture.ts          # sparse-map position builder
|  |- unit/                       # topology, coordinates, initialPosition,
|  |                              #   movement, pawns, castling, check, terminal,
|  |                              #   teams, serialization, security.import
|  |- property/invariants.test.ts # fast-check over random legal games
|  \- e2e/                        # gameplay, keyboard, mobile, persistence,
|                                 #   basePath, network + server.mjs
|- index.html
|- vite.config.ts                 # base './' + build-only strict CSP
|- vitest.config.ts
|- playwright.config.ts           # serves dist/ under /QuadChess/
|- tsconfig.json                  # strict + noUncheckedIndexedAccess
|- package.json
\- README.md rules.md architecture.md testing.md CONTRIBUTING.md NOTICES.md LICENSE
```

Two deviations from the Phase 1 plan, both deliberate:

- **`src/engine/session.ts`** holds undo/redo. The Phase 1 tree put it under the
  UI, but it is state management over immutable game states and belongs with the
  engine, where it is testable without a DOM.
- **`src/storage/schema.ts` was not created.** Import validation lives in
  `serialization.ts` next to the code that produces the format, so the writer and
  the validator cannot drift apart. `localGameStore.ts` calls into it.

## 3. Core data model

```ts
type PlayerColor = 'red' | 'blue' | 'yellow' | 'green';
type PieceType   = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

interface Coord { readonly r: number; readonly c: number; }

interface Piece {
  readonly type: PieceType;
  readonly owner: PlayerColor;
  readonly hasMoved: boolean;   // castling + pawn double step
  readonly dead: boolean;       // eliminated owner, FFA (rules.md §10.3)
}

interface GameState {
  readonly rulesVersion: '4pc-rules/1.0.0';
  readonly profileId: string;
  readonly board: ReadonlyArray<Piece | null>;   // length 196; corners always null
  readonly toMove: PlayerColor;
  readonly active: ReadonlyArray<PlayerColor>;   // rotation order, eliminated removed
  readonly status: Record<PlayerColor, PlayerStatus>;
  readonly scores: Record<PlayerColor, number>;
  readonly enPassant: EnPassantTarget | null;
  readonly halfmoveClock: number;                // for the 50-move rule
  readonly ply: number;
  readonly history: ReadonlyArray<MoveRecord>;
  readonly repetition: Readonly<Record<string, number>>;
  readonly result: GameResult | null;
}

type PlayerStatus =
  | { kind: 'active' }
  | { kind: 'eliminated'; by: 'checkmate' | 'stalemate' | 'resign' | 'timeout'; atPly: number };
```

The board is a flat 196-length array indexed `r * 14 + c`. Corner indexes are
permanently `null` and are additionally guarded by `isPlayable` — the array
layout is an implementation detail, never a rule.

---

## 4. Move pipeline

`applyMove(state, move, profile)` executes the nine required steps in order:

| # | Step | Module |
|---|---|---|
| 1 | Build the pseudo-legal move | `movement.ts` |
| 2 | Validate piece-specific geometry | `movement.ts` |
| 3 | Validate path clearance through `isPlayable` | `movement.ts` + `coordinates.ts` |
| 4 | Validate occupancy / capture / teammate rules | `legalMoves.ts` |
| 5 | Apply tentatively to a **copied** state | `gameState.ts` |
| 6 | Recompute attacks and checks | `attacks.ts`, `check.ts` |
| 7 | Reject if the mover is still in check | `legalMoves.ts` |
| 8 | Commit capture, promotion, scoring, elimination, turn advance | `scoring.ts`, `elimination.ts`, `turnOrder.ts` |
| 9 | Return a new state + structured `MoveResult` | `gameState.ts` |

```ts
type MoveResult =
  | { ok: true; state: GameState; record: MoveRecord; events: GameEvent[] }
  | { ok: false; reason: IllegalMoveReason };   // never throws for illegal input
```

`GameEvent` is the single source for UI updates, sounds and screen-reader
announcements: `{kind:'move'|'capture'|'check'|'checkmate'|'stalemate'|'promotion'|'elimination'|'score'|'gameEnd', ...}`.
The UI subscribes; it never re-derives rules.

**Undo/redo** stores the immutable `GameState` for each ply in a bounded ring
(`maxMoveHistoryPlies`), so undo is a pointer move, not an inverse-move
computation. Redo is discarded on a new move.

---

## 5. Notation

Per-ply: `<Colour>:<SAN-like>` — e.g. `R:Nn5-l6`, `Y:hxg11=Q`, `B:O-O`.
Explicit origin squares are always written (long algebraic) because with 64
pieces of four colours, short SAN disambiguation is unreadable. History renders
one row per round:

```
1.  R:m8-l8    B:b7-c7    Y:h2-h4    G:g13-g11
```

`notation.ts` round-trips text <-> `MoveRecord` and is covered by T-19.

---

## 6. Transport boundary

```ts
interface Transport {
  readonly kind: string;
  send(intent: MoveIntent): Promise<void>;
  onRemote(handler: (intent: MoveIntent) => void): () => void;
  close(): void;
}
```

`LocalTransport` resolves immediately and replays the intent into the local
engine: four people, one device, one tab. **That is the only transport that will
exist.** Nothing in the shipped app opens a socket, and there is no signalling
server, so online play does not work and the README will say exactly that. A
WebRTC transport would still need a signalling channel the user supplies; if it
is ever added it goes in a separate optional module with no default STUN/TURN
endpoints.

---

## 7. Persistence and security

- **Save/resume:** `localStorage` under one versioned key. IndexedDB is not needed
  at this size; the store interface allows swapping later.
- **Import validation order:** byte-length cap (`maxImportBytes`) -> `JSON.parse`
  in a try/catch -> strict hand-written schema (no `eval`, no `new Function`, no
  third-party validator) -> semantic checks: rules version recognised, profile
  known, board length 196, corners empty, every piece on a playable square, each
  active player has exactly one king, `toMove` is active, scores finite integers,
  history within limits. Only then does it become a `GameState`.
- **Rendering:** all user-visible strings go through `textContent` or an escaping
  helper. No `innerHTML` with dynamic data. Player names are truncated and
  treated as untrusted.
- A restrictive `Content-Security-Policy` meta tag (`default-src 'self'`) both
  hardens the page and makes test T-25 (no third-party requests) structural
  rather than aspirational.

---

## 8. Build and deployment

- **Vite + TypeScript, `strict: true`.** Chosen over a no-build setup because
  TypeScript and Vitest are explicit requirements and a hand-rolled ES-module
  build would lose type checking entirely.
- `base: './'` in `vite.config.ts` so the same `dist/` works at a user site, at a
  project subpath (`/repository-name/`), and from `file:`-adjacent static servers.
  All asset references are relative; the router is hash-free (single page).
- `public/.nojekyll` prevents GitHub Pages from dropping `_`-prefixed files.
- `.github/workflows/deploy.yml`: checkout -> setup-node -> `npm ci` -> `npm run
  build` -> `actions/upload-pages-artifact` -> `actions/deploy-pages`, using the
  repository's built-in `GITHUB_TOKEN` via `permissions: {pages: write, id-token:
  write}`. **No secrets are added to the repository or the workflow.**
- Test T-24 serves `dist/` under a `/repository-name/` subpath and asserts the app
  boots with no 404s.

---

## 9. Accessibility plan

- The board is a `role="grid"` of `role="gridcell"` buttons; missing corners are
  `role="presentation"` and are not focusable.
- One roving `tabindex`; arrow keys move across playable squares only (skipping
  corners), Enter/Space selects and moves, Escape cancels.
- Each cell's accessible name states square, piece, colour and legal-move status,
  e.g. *"h4, empty, legal move for Yellow pawn"*, *"n8, Red king, in check"*.
- An `aria-live="polite"` region announces every move, check, promotion,
  elimination and result. Errors use `aria-live="assertive"`.
- Ownership is never colour-only: each army also has a distinct piece-border
  style, a corner glyph (R/B/Y/G) and a fill pattern, all toggleable.
- `prefers-reduced-motion` disables piece-slide animation.
- Move history is a real `<ol>`, readable and navigable without the board.
- Contrast targets 4.5:1 for text and 3:1 for non-text indicators, verified in
  Phase 5.

---

## 10. Tooling

Node 20+ and npm are required. Development used Node 24.19.0 and npm 11.17.0.

```bash
npm install
npx playwright install chromium   # once, for browser tests
npm run test:all
```

The Phase 1 draft of this document recorded "Node is not installed" as a blocker.
It was resolved by installing Node 20 LTS; Vite, TypeScript, Vitest and Playwright
all run, and no dependency-free fallback was needed.

### Why these choices

- **Vite + TypeScript strict** over a no-build setup: TypeScript and Vitest were
  required, and a hand-rolled ES-module build would lose type checking entirely.
- **`noUncheckedIndexedAccess`** is on. It is noisy, but on a board addressed by
  computed indexes it turns a whole class of off-by-one bugs into compile errors.
- **`assetsInlineLimit: 0`** keeps the WAV files as separate requests to the same
  origin rather than inflating the JS bundle with base64.
- **`modulePreload.polyfill: false`** because the polyfill is emitted as an inline
  `<script>`, which the strict CSP forbids.
