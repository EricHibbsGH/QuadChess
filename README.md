# QuadChess

Four-player chess for four people, either sitting at one device (pass and play)
or playing online across four separate computers. The whole game — rules
engine, board, artwork and sounds — runs inside the page. There is no account,
no database and no analytics. Online play connects browsers directly to each
other over WebRTC using the public PeerJS broker only to introduce them; there
is no game server of ours in the middle.

![Board screenshot placeholder](docs/screenshot-desktop.png)
![Mobile screenshot placeholder](docs/screenshot-mobile.png)

> Screenshots are placeholders. Run `npm run dev` and capture `docs/screenshot-desktop.png`
> and `docs/screenshot-mobile.png` to fill them in.

---

## What it is

- A 14 x 14 board with the four 3 x 3 corners removed, leaving **160 playable squares**.
- Four armies of 16 pieces: Green at the top, Blue at the left, Red at the right,
  Yellow at the bottom.
- Two rules profiles: **Standard Teams** (Red + Yellow against Blue + Green) and
  **Standard Free-for-All** (four individuals, scored).
- A complete, deterministic rules engine: sliding and leaping movement across the
  cross, four pawn orientations, en passant, castling, promotion, pins,
  discovered checks, multi-player check, checkmate, stalemate, elimination,
  scoring, draws, undo/redo and save/load.

Every rule decision is written down in [rules.md](rules.md) and is a named
setting in a versioned rules profile — not a hidden branch in the UI.

## Prerequisites

- **Node.js 20 or newer** and npm. (Developed against Node 24.19, npm 11.)
- A modern browser for playing. No other tooling is required.

## Installation

```bash
git clone https://github.com/EricHibbsGH/QuadChess.git
cd QuadChess
npm install
```

## Development

```bash
npm run dev          # Vite dev server on http://localhost:5173
```

## Tests

```bash
npm run typecheck    # TypeScript, strict mode, no emit
npm run test         # Vitest: unit + property-based tests
npm run test:e2e     # Playwright: browser tests against the production build
npm run test:all     # all of the above, in order
```

`npm run test:e2e` builds the app and serves `dist/` from
`http://127.0.0.1:4173/QuadChess/`, so the browser tests exercise the
real bundle under a repository-style sub-path. Run
`npx playwright install chromium` once before the first browser run.

See [testing.md](testing.md) for what each suite covers.

## Production build

```bash
npm run build        # typecheck, then emit dist/
npm run preview      # serve dist/ locally
```

`dist/` is completely self-contained. You can also serve it with any static
server:

```bash
npx serve dist
```

## Deploying to GitHub Pages

The build uses `base: './'`, so the same `dist/` works at a user site
(`https://user.github.io/`), at a project site
(`https://user.github.io/repository-name/`) and from any sub-directory.

1. Push to the `main` branch of a GitHub repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) typechecks,
   runs every test, builds, and deploys `dist/`.

The workflow uses only the automatically-provided `GITHUB_TOKEN`. **No secrets
are stored in this repository or referenced by the workflow.**

If you ever need an absolute base path, set `VITE_BASE` at build time:

```bash
VITE_BASE=/repository-name/ npm run build
```

## Playing with friends

Once Pages is enabled the game lives at:

**https://erichibbsgh.github.io/QuadChess/**

Share that link with anyone. There is nothing to install and no account to make —
it opens and plays straight away, on a phone, tablet or computer.

**How four people actually play:** all four can take turns on **one** screen
(pass and play), or one player can choose **Play online** in the toolbar to host
a room and share the generated link or room code with the other three. Each of
them opens the link (or enters the code), and moves made on any of the four
screens appear on all of them.

Hosting and joining talk to the public PeerJS signalling broker
(`0.peerjs.com`) just long enough to connect the browsers to each other; after
that, moves travel directly between the four browsers over WebRTC.

If you would rather not use online play, **Save / load** still lets you copy
the game text between players between turns.

## Network and privacy behaviour

- In pass-and-play mode the app makes **no network requests** after the initial
  page load.
- Online play opens a connection to the public PeerJS broker (`0.peerjs.com`)
  to find the other players, then a direct peer-to-peer WebRTC data channel
  between browsers. No game state is sent to, or stored on, any server of ours.
  The built page ships a `Content-Security-Policy` that only allows network
  connections to that broker and to STUN/TURN, so the browser enforces this
  boundary rather than us merely testing for it.
- All JavaScript, CSS, piece artwork and sounds are in this repository. Piece
  artwork is inline SVG authored for this project; the six sound cues are
  original WAV files. Nothing is loaded from a CDN except the PeerJS library
  itself (bundled at build time, not loaded from a CDN at runtime). See
  [NOTICES.md](NOTICES.md).
- Your game and preferences are stored in **your browser's `localStorage`**
  only. Nothing is uploaded. Clearing site data deletes them.
- No analytics, no telemetry, no cookies, no accounts.

## Pass-and-play versus online multiplayer

| | Supported? |
|---|---|
| **Pass and play** — four people taking turns at one device, in one browser tab | **Yes.** |
| **Online multiplayer** — four people on four devices | **Yes**, via **Play online** in the toolbar. |

The engine is written behind a `Transport` interface
([`src/multiplayer/transport.ts`](src/multiplayer/transport.ts)) so the rules
engine never knows whether it is talking to `LocalTransport` (pass and play, in
process) or `PeerTransport` (online, over WebRTC) — see
[`src/multiplayer/peerTransport.ts`](src/multiplayer/peerTransport.ts).

## Known limitations

- **Online play needs all four browsers to reach the public PeerJS broker and
  each other directly.** Very restrictive corporate firewalls can block WebRTC;
  there is no fallback relay server.
- **Clocks are off by default.** Timeout behaviour is implemented and tested, but
  no time control is configured in either shipped profile (rules.md AMB-11).
- **Insufficient-material draws are not detected.** With up to four armies and
  dead pieces on the board there is no well-defined test, so rather than guess and
  create false draws the rule is disabled (rules.md AMB-10).
- **Team seating is a documented compromise.** The brief's seating, team pairs and
  "teammates sit opposite" cannot all hold at once; see
  [rules.md AMB-1](rules.md#amb-1). The default keeps the seating and the named
  teams; `standard-teams-classic` is the opposite-seating variant.
- **Draw offers are not negotiated in the UI.** "Offer draw" asks the person at
  the device to confirm that everyone agreed; the app cannot poll absent players.
- **The rules profile cannot change mid-game** — switching starts a new game, by
  design, so a saved game's rules can never shift under it.
- **Undo is unlimited and shared.** Any player can undo any move; there is no
  per-player undo permission, which suits a friendly game at one table.
- The move list caps at 2000 plies and imports at 1 MB.

## Documentation

| File | What it covers |
|---|---|
| [rules.md](rules.md) | Board topology, coordinates, every rule and every documented ambiguity |
| [architecture.md](architecture.md) | Module layout, the move pipeline, data model, security, deployment |
| [testing.md](testing.md) | What each test suite proves, and how to run it |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to work on this safely |
| [NOTICES.md](NOTICES.md) | Every asset, its source and its licence |
| [LICENSE](LICENSE) | MIT |

## License

MIT — see [LICENSE](LICENSE).

This project contains no Chess.com artwork, source code, branding, logos, sounds
or other proprietary assets.
