# Testing

Three layers, all runnable locally and all run in CI:

| Layer | Tool | Location | What it proves |
|---|---|---|---|
| Unit | Vitest | `tests/unit/` | Rules, one behaviour per test, from minimal fixtures |
| Property | Vitest + fast-check | `tests/property/` | Invariants hold across random legal games |
| Browser | Playwright | `tests/e2e/` | The built app, under a Pages sub-path, in a real browser |

```bash
npm run typecheck    # tsc --noEmit, strict
npm run test         # unit + property
npm run test:e2e     # browser (builds first, then serves dist/)
npm run test:all     # everything, in order
```

Browser tests need Chromium once: `npx playwright install chromium`.

---

## How the rule tests are written

Each test states the rule it verifies in its name, and each rule fixture contains
only the pieces that rule needs. Positions are written as a sparse map of square
to piece code by `tests/support/fixture.ts`:

```ts
position(STANDARD_TEAMS, {
  pieces: { h7: 'YK', h9: 'YR', h11: 'GR' },  // king, pinned rook, pinner
  toMove: 'yellow',
});
```

Piece codes are `<colour tag><type>` with optional `m` (has moved) and `d`
(dead): `YK`, `RPm`, `GNd`.

**Expected move sets were derived independently.** The destination lists in
`tests/unit/movement.test.ts` were computed from a separate model of the board
written for the purpose, not read back out of the engine, so the tests can
disagree with the implementation. Two errors were caught this way during
development: two corner-traversal examples in `rules.md` §5.1 were wrong, and an
en-passant fixture placed a pawn on its own promotion line.

---

## Required coverage map

Every item from the project brief, and where it is verified.

| # | Requirement | Where |
|---|---|---|
| 1 | Exactly 160 playable squares | `unit/topology.test.ts`, `e2e/gameplay.spec.ts` |
| 2 | Exactly four excluded 3x3 corners | `unit/topology.test.ts` |
| 3 | Correct initial position for all 64 pieces | `unit/initialPosition.test.ts`, `e2e/gameplay.spec.ts` |
| 4 | Correct turn order | `unit/initialPosition.test.ts`, `e2e/gameplay.spec.ts` |
| 5 | Every piece's legal and illegal movement | `unit/movement.test.ts`, `unit/castling.test.ts` |
| 6 | Every pawn orientation | `unit/pawns.test.ts` |
| 7 | Paths near all four missing corners | `unit/movement.test.ts`, `unit/check.test.ts` |
| 8 | Sliding pieces blocked by missing corners | `unit/movement.test.ts` |
| 9 | Capturing and friendly blocking | `unit/movement.test.ts` |
| 10 | Team capture restrictions | `unit/teams.test.ts`, `unit/movement.test.ts`, `unit/pawns.test.ts` |
| 11 | Check detection from every direction | `unit/check.test.ts` |
| 12 | Pins and discovered checks | `unit/check.test.ts` |
| 13 | A player attacked by multiple opponents | `unit/check.test.ts` |
| 14 | Checkmate and stalemate | `unit/terminal.test.ts` |
| 15 | Promotion for every player | `unit/pawns.test.ts` |
| 16 | Elimination and turn advancement | `unit/terminal.test.ts` |
| 17 | Scoring for every configured event | `unit/terminal.test.ts` |
| 18 | Undo and redo | `unit/serialization.test.ts`, `e2e/gameplay.spec.ts` |
| 19 | Serialization round trips | `unit/serialization.test.ts`, `property/invariants.test.ts` |
| 20 | Invalid and malicious import data | `unit/security.import.test.ts`, `e2e/persistence.spec.ts` |
| 21 | Reloading a saved game | `unit/serialization.test.ts`, `e2e/persistence.spec.ts` |
| 22 | Keyboard-only interaction | `e2e/keyboard.spec.ts` |
| 23 | Mobile viewport layout | `e2e/mobile.spec.ts` |
| 24 | GitHub Pages base-path deployment | `e2e/basePath.spec.ts` (whole suite runs under `/QuadChess/`) |
| 25 | No runtime requests to third-party origins | `e2e/network.spec.ts` |

## Invariants (property-based)

`tests/property/invariants.test.ts` plays random legal games in both profiles and
asserts after every ply:

| ID | Invariant |
|---|---|
| INV-1 | No piece occupies an unplayable coordinate |
| INV-2 | A legal move never leaves the mover in check |
| INV-3 | Every active player has exactly one king; eliminated players have none |
| INV-4 | The turn pointer names an active player; the active list has no duplicates |
| INV-5 | All scores are finite integers |
| INV-6 | `deserialize(serialize(s))` preserves the state |
| INV-7 | Move history never exceeds `maxMoveHistoryPlies` |
| INV-9 | Applying a move never mutates the input state |

It also applies **every** generated legal move from each position reached, not
just the one it follows, so "the generator only produces legal moves" is checked
exhaustively per position rather than sampled.

INV-8 (piece conservation) is covered indirectly by the snapshot comparisons in
undo and round-trip tests rather than as a standalone property.

## Browser tests

`playwright.config.ts` builds the app and serves `dist/` from
`http://127.0.0.1:4173/QuadChess/` using `tests/e2e/server.mjs`. Testing
the production bundle under a sub-path is what makes requirement 24 a real test;
running against the dev server would prove nothing about deployment.

Two projects run:

- `desktop-chromium` — everything except `mobile.spec.ts`
- `mobile-chromium` — `mobile.spec.ts` only, on a Pixel 5 profile with touch

`network.spec.ts` records every request the browser makes during pass-and-play
load and play and fails if any leaves the origin. It also disables the network
mid-game and keeps playing, and asserts the built page's CSP scopes `connect-src`
to the PeerJS broker/STUN/TURN only and has no inline `<script>`.

## Things deliberately not tested

- **Visual appearance.** There are no screenshot-comparison tests; they are
  brittle and would fail on font and rendering differences between machines.
- **Sound playback.** Audio is triggered behind a user gesture and browser
  autoplay policies make it unreliable to assert. The cue-selection logic is pure
  and could be unit tested; the actual playback is not.
- **Contrast ratios.** The palette was chosen for contrast but it is not measured
  automatically. Adding an axe-core pass would be a sensible next step.
- **Insufficient-material draws.** The rule is disabled, so there is nothing to
  test (rules.md AMB-10).
