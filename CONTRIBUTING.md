# Contributing

## The one rule that matters

**A rule change is a change to `rules.md` and to a rules profile — never a change
buried in the UI.**

If you find yourself writing `if (color === 'red')` or a special case for one
board region inside `src/ui/`, stop. The behaviour belongs in
`src/rules/types.ts` as a named setting, documented in `rules.md` §13, with a
test.

## Getting set up

```bash
npm install
npx playwright install chromium   # once, for browser tests
npm run test:all                  # should be green before you start
```

Node 20+ is required.

## Project boundaries

| Layer | May import | Must never |
|---|---|---|
| `src/engine/**` | other engine modules, `src/rules/**` (types only) | touch the DOM, `window`, `document`, or anything in `src/ui/**` |
| `src/rules/**` | engine types | contain logic; profiles are data objects |
| `src/ui/**` | engine and rules (read-only) | decide what is legal, or re-derive rules from DOM state |
| `src/storage/**`, `src/multiplayer/**` | engine | contain rules |

The engine must stay runnable in plain Node with no DOM. If a new engine test
needs `jsdom`, something has been imported that should not have been.

## Non-negotiables

1. **`isPlayable` is the only topology test.** Never inline a corner check.
2. **State transitions are pure.** `applyMove` returns a new state and never
   mutates its input (INV-9). Copy, then modify the copy.
3. **Illegal input returns a result, never throws.** Engine entry points return
   `{ ok: false, reason }`. `fromNotation` returns `null`. Imports are rejected
   with a message.
4. **No `eval`, no `new Function`, no `innerHTML` with dynamic data.** All
   user-visible text goes through `textContent`.
5. **No `alert`, `confirm` or `prompt`.** Use `src/ui/dialogs.ts`.
6. **No network beyond online play.** No fetch, XHR, CDN link, web font or
   analytics outside of `src/multiplayer/peerTransport.ts`. `tests/e2e/network.spec.ts`
   enforces this and the built page ships a CSP whose `connect-src` is scoped to
   the PeerJS broker and STUN/TURN only.
7. **No secrets** in the repository or in workflows.

## Changing a rule

1. Write the change in `rules.md` first: the behaviour, the option name, the
   default for each profile, and an `AMB-n` entry if it is a judgement call.
2. Add the field to `RulesProfile` in `src/rules/types.ts` and set it in every
   profile. TypeScript will tell you which profiles you missed.
3. Implement it in the engine, reading the field — never hard-coding it.
4. Add a unit test named after the rule, using the smallest fixture that shows it.
5. Add a row to the coverage map in `testing.md`.

If the change could alter how an existing saved game is interpreted, bump
`RULES_VERSION`. Old saves are then refused rather than silently re-read, which
is the point of the version.

## Writing tests

- One behaviour per test, and the test name states the rule.
- Build minimal fixtures with `tests/support/fixture.ts`, not full games.
- **Derive expected values independently** where you can. The movement
  destination sets were computed from a separate model of the board; that is what
  caught two real errors in the spec and one in a fixture. A test that just
  records what the code currently does proves nothing.
- Prefer a property test when the claim is "for all positions".

## Adding assets

Any new asset must be original or openly licensed, stored in this repository, and
recorded in `NOTICES.md` with its source and licence. Do not add anything from a
commercial chess product — artwork, sounds, piece sets, branding or code.

## Accessibility

Treat these as part of "done", not polish:

- Keyboard reaches and operates everything; focus is always visible.
- New interactive elements have accessible names that say what they do.
- Anything communicated by colour is also communicated another way — a tag, a
  pattern, a border, or text.
- Anything important that changes without user action is announced through the
  live region in `src/ui/accessibility.ts`.
- Motion respects `prefers-reduced-motion`.

## Before opening a pull request

```bash
npm run test:all
```

All of typecheck, unit, property, build and browser tests must pass. In your
description, say which rule changed, which profile defaults moved, and whether
`RULES_VERSION` was bumped.
