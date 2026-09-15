# Four-Player Chess — Rules Specification

**Rules document version:** `1.0.0`
**Status:** Implemented. Every rule below is enforced by the engine and covered
by tests; see `testing.md` for the requirement-to-test map.
**Engine rules version string:** `4pc-rules/1.0.0`

Every saved or exported game embeds `rulesVersion` and `profileId`. The engine
**rejects** any file whose `rulesVersion` it does not recognise, so a later change
to this document can never silently re-interpret an existing game.

This document is normative. Where the reference image and the written brief
disagree, or where four-player chess has no universally agreed behaviour, the
question is recorded in [§14](#14-deviations-ambiguities-and-open-questions) and
resolved by a **named configuration option** in the rules matrix
([§13](#13-rules-matrix)) — never by an undocumented decision buried in code.

---

## 1. Board topology

A 14 x 14 grid with the four 3 x 3 corner blocks removed, giving a cross shape.

| Quantity | Value |
|---|---|
| Grid cells | 196 (14 x 14) |
| Excluded corner cells | 36 (4 blocks x 9) |
| **Playable squares** | **160** |
| Armies | 4 |
| Pieces per army | 16 (8 pawns + 8 major/minor) |
| Pieces at start | 64 |

The four excluded blocks, as `[row, col]` index ranges:

| Block | Rows | Cols |
|---|---|---|
| Top-left | 0–2 | 0–2 |
| Top-right | 0–2 | 11–13 |
| Bottom-left | 11–13 | 0–2 |
| Bottom-right | 11–13 | 11–13 |

Corner cells are **absent**, not differently-coloured playable squares. They are
rendered as empty space; no piece may occupy or pass through them.

### 1.1 The single topology predicate

```ts
export function isPlayable(r: number, c: number): boolean {
  if (r < 0 || r > 13 || c < 0 || c > 13) return false;          // in bounds
  if ((r <= 2 || r >= 11) && (c <= 2 || c >= 11)) return false;  // corner block
  return true;
}
```

**Rule T-1.** Every movement generator — sliding, leaping, pawn pushes, pawn
captures, castling transit squares, en-passant target squares — consults
`isPlayable`. A sliding ray terminates when it leaves the playable set, exactly
as it terminates at the edge of the grid. There is no wrapping and no jumping
over a missing corner: a rook on `a4` sliding toward rank 1 stops immediately,
because `a3` is not playable.

**Rule T-2.** A knight leaps rather than traverses. A knight move is legal if its
*destination* is playable, whether or not the cells it passes over exist.

### 1.2 Square colouring

Square colour is cosmetic and has no rule effect. A square is *light* when
`(r + c)` is even, *dark* when `(r + c)` is odd. Ownership is never communicated
by colour alone — see `accessibility` requirements in `architecture.md`.

---

## 2. Coordinate system

### 2.1 Canonical internal coordinates

The engine's only internal representation is `{ r: 0..13, c: 0..13 }`.

- `r` = **row index**, `0` at the **top**, `13` at the **bottom**.
- `c` = **column index**, `0` at the **left**, `13` at the **right**.

### 2.2 Human-readable notation

- **File** letter `a`–`n` maps to `c = 0..13`.
- **Rank** number `1`–`14` maps to `r` by `rank = 14 - r` (rank 14 is the top row).
- A square is written `<file><rank>`: `h1` = `{ r: 13, c: 7 }`, `n8` = `{ r: 6, c: 13 }`.

```
toNotation({ r, c }) -> FILES[c] + String(14 - r)
fromNotation(s)      -> { r: 14 - rank, c: FILES.indexOf(file) }
```

`fromNotation` returns `null` for malformed input and for any square that is not
playable. It never throws.

### 2.3 Coordinate diagram

`#` = missing corner cell, `.` = playable square.

```
         c=  0   1   2   3   4   5   6   7   8   9  10  11  12  13
             a   b   c   d   e   f   g   h   i   j   k   l   m   n
  r= 0  r14  #   #   #   .   .   .   .   .   .   .   .   #   #   #
  r= 1  r13  #   #   #   .   .   .   .   .   .   .   .   #   #   #
  r= 2  r12  #   #   #   .   .   .   .   .   .   .   .   #   #   #
  r= 3  r11  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 4  r10  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 5  r 9  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 6  r 8  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 7  r 7  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 8  r 6  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r= 9  r 5  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r=10  r 4  .   .   .   .   .   .   .   .   .   .   .   .   .   .
  r=11  r 3  #   #   #   .   .   .   .   .   .   .   .   #   #   #
  r=12  r 2  #   #   #   .   .   .   .   .   .   .   .   #   #   #
  r=13  r 1  #   #   #   .   .   .   .   .   .   .   .   #   #   #
```

Row counts: rows 0–2 and 11–13 have 8 playable squares each (6 x 8 = 48);
rows 3–10 have 14 each (8 x 14 = 112). Total **160**.

### 2.4 Named regions

| Region | Definition | Squares |
|---|---|---|
| Central band | `r` in 3..10 **and** `c` in 3..10 | 64 |
| Top arm (Green home) | `r` in 0..2, `c` in 3..10 | 24 |
| Bottom arm (Yellow home) | `r` in 11..13, `c` in 3..10 | 24 |
| Left arm (Blue home) | `c` in 0..2, `r` in 3..10 | 24 |
| Right arm (Red home) | `c` in 11..13, `r` in 3..10 | 24 |

64 + 4 x 24 = 160. The band and the four arms partition the board exactly; arms
never overlap.

### 2.5 Perspective rotation (display only)

`rotateForSeat(coord, seat)` maps canonical coordinates to view coordinates so
any army can be shown at the bottom of the screen. It is a **presentation
function used only by the UI**. The engine never calls it and no rule depends on
it.

| View seat | Transform `(r, c) ->` |
|---|---|
| bottom (Yellow) | `(r, c)` — identity |
| left (Blue) | `(13 - c, r)` |
| top (Green) | `(13 - r, 13 - c)` |
| right (Red) | `(c, 13 - r)` |

Each transform is a symmetry of the cross, so every rotated view is still a
valid board shape.

---

## 3. Seating, teams and turn order

### 3.1 Seats (taken from the reference image)

| Colour | Seat | Faces | Back line | Pawn line |
|---|---|---|---|---|
| **Green** | Top | down `(+1, 0)` | `r = 0` (rank 14) | `r = 1` (rank 13) |
| **Blue** | Left | right `(0, +1)` | `c = 0` (file a) | `c = 1` (file b) |
| **Red** | Right | left `(0, -1)` | `c = 13` (file n) | `c = 12` (file m) |
| **Yellow** | Bottom | up `(-1, 0)` | `r = 13` (rank 1) | `r = 12` (rank 2) |

### 3.2 Turn order

`["red", "blue", "yellow", "green"]`, Red first. Play cycles through this list,
skipping eliminated players (§10).

- A **ply** is one player's move.
- A **round** is one pass through the turn order.

### 3.3 Teams (Standard Teams profile)

| Team | Members | Seats |
|---|---|---|
| Team 1 | Red + Yellow | right + bottom |
| Team 2 | Blue + Green | left + top |

> **This encodes the contradiction recorded as [AMB-1](#amb-1).** The brief says
> *"opposite players are teammates"* **and** *"Red and Yellow form one team"*
> **and** seats Green top / Blue left / Red right / Yellow bottom. Those three
> statements are mutually unsatisfiable (proof in §14). The configuration above
> keeps the seating, the named team pairs and the literal turn order, and drops
> the word *opposite*; the teams become **adjacent-arm** teams.
>
> The starting position remains exactly fair. Rotating the board 180 degrees maps
> right->left and bottom->top, i.e. maps Team 1's seats onto Team 2's seats, and
> the initial placement is 90-degree rotationally symmetric, so both teams begin
> with congruent positions. The turn order alternates teams
> (Red, **Blue**, Yellow, **Green** = T1, T2, T1, T2), which is the property that
> actually matters at the board.
>
> `seating`, `teams` and `turnOrder` are profile **data**, so the alternative
> resolutions in §14 are a one-line change. A second profile,
> `standard-teams-classic`, ships alongside for the opposite-teammates variant.

---

## 4. Initial position

Each army's back line, read **from that army's own left to its own right**, is
the standard chess order:

```
Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook
```

That single statement generates all four armies and is exactly equivalent to
"rotate Yellow's setup 90 degrees clockwise three times". The engine builds the
start position from the rule, not from a hard-coded table; the tables below are
its generated output and are asserted by test **T-03**.

### 4.1 Diagram

`GR` = Green rook, `YP` = Yellow pawn, `.` = empty playable square.

```
         a   b   c   d   e   f   g   h   i   j   k   l   m   n
      +-------------------------------------------------------+
  14  |            GR  GN  GB  GK  GQ  GB  GN  GR             |  14
  13  |            GP  GP  GP  GP  GP  GP  GP  GP             |  13
  12  |             .   .   .   .   .   .   .   .             |  12
  11  |BR  BP   .   .   .   .   .   .   .   .   .   .  RP  RR |  11
  10  |BN  BP   .   .   .   .   .   .   .   .   .   .  RP  RN |  10
   9  |BB  BP   .   .   .   .   .   .   .   .   .   .  RP  RB |  9
   8  |BQ  BP   .   .   .   .   .   .   .   .   .   .  RP  RK |  8
   7  |BK  BP   .   .   .   .   .   .   .   .   .   .  RP  RQ |  7
   6  |BB  BP   .   .   .   .   .   .   .   .   .   .  RP  RB |  6
   5  |BN  BP   .   .   .   .   .   .   .   .   .   .  RP  RN |  5
   4  |BR  BP   .   .   .   .   .   .   .   .   .   .  RP  RR |  4
   3  |             .   .   .   .   .   .   .   .             |  3
   2  |            YP  YP  YP  YP  YP  YP  YP  YP             |  2
   1  |            YR  YN  YB  YQ  YK  YB  YN  YR             |  1
      +-------------------------------------------------------+
         a   b   c   d   e   f   g   h   i   j   k   l   m   n
```

Green's back line reads `R N B K Q B N R` left-to-right while Yellow's reads
`R N B Q K B N R`. Both are `R N B Q K B N R` from the *owner's* left; Green
simply faces the other way. The four kings are therefore **not** on matching
files, and this matches the reference image.

### 4.2 Exact starting squares (all 64 pieces)

**Red — right arm, forward `(0, -1)`**

| Piece | Square | `(r, c)` |
|---|---|---|
| Rook | `n11` | (3, 13) |
| Knight | `n10` | (4, 13) |
| Bishop | `n9` | (5, 13) |
| King | `n8` | (6, 13) |
| Queen | `n7` | (7, 13) |
| Bishop | `n6` | (8, 13) |
| Knight | `n5` | (9, 13) |
| Rook | `n4` | (10, 13) |
| Pawn x8 | `m4 m5 m6 m7 m8 m9 m10 m11` | (10,12) (9,12) (8,12) (7,12) (6,12) (5,12) (4,12) (3,12) |

**Blue — left arm, forward `(0, +1)`**

| Piece | Square | `(r, c)` |
|---|---|---|
| Rook | `a11` | (3, 0) |
| Knight | `a10` | (4, 0) |
| Bishop | `a9` | (5, 0) |
| Queen | `a8` | (6, 0) |
| King | `a7` | (7, 0) |
| Bishop | `a6` | (8, 0) |
| Knight | `a5` | (9, 0) |
| Rook | `a4` | (10, 0) |
| Pawn x8 | `b4 b5 b6 b7 b8 b9 b10 b11` | (10,1) (9,1) (8,1) (7,1) (6,1) (5,1) (4,1) (3,1) |

**Yellow — bottom arm, forward `(-1, 0)`**

| Piece | Square | `(r, c)` |
|---|---|---|
| Rook | `d1` | (13, 3) |
| Knight | `e1` | (13, 4) |
| Bishop | `f1` | (13, 5) |
| Queen | `g1` | (13, 6) |
| King | `h1` | (13, 7) |
| Bishop | `i1` | (13, 8) |
| Knight | `j1` | (13, 9) |
| Rook | `k1` | (13, 10) |
| Pawn x8 | `d2 e2 f2 g2 h2 i2 j2 k2` | (12,3) (12,4) (12,5) (12,6) (12,7) (12,8) (12,9) (12,10) |

**Green — top arm, forward `(+1, 0)`**

| Piece | Square | `(r, c)` |
|---|---|---|
| Rook | `d14` | (0, 3) |
| Knight | `e14` | (0, 4) |
| Bishop | `f14` | (0, 5) |
| King | `g14` | (0, 6) |
| Queen | `h14` | (0, 7) |
| Bishop | `i14` | (0, 8) |
| Knight | `j14` | (0, 9) |
| Rook | `k14` | (0, 10) |
| Pawn x8 | `d13 e13 f13 g13 h13 i13 j13 k13` | (1,3) (1,4) (1,5) (1,6) (1,7) (1,8) (1,9) (1,10) |

**Kings:** Red `n8`, Blue `a7`, Yellow `h1`, Green `g14`.
**Queens:** Red `n7`, Blue `a8`, Yellow `g1`, Green `h14`.

Verified in Phase 1: 64 pieces, every one on a playable square, exact 90-degree
rotational symmetry under `(r, c) -> (c, 13 - r)` mapping Yellow -> Blue ->
Green -> Red.

---

## 5. Movement

All movement is generated in canonical coordinates and filtered through
`isPlayable`. "Opponent" means any player who is not the mover and not the
mover's teammate.

| Piece | Vectors | Sliding | Notes |
|---|---|---|---|
| Rook | `(±1,0) (0,±1)` | yes | ray stops at board edge, missing corner, or first occupied square |
| Bishop | `(±1,±1)` | yes | same; diagonals cross the arm/band boundary normally |
| Queen | rook + bishop | yes | |
| Knight | `(±1,±2) (±2,±1)` | no | destination playability only (Rule T-2) |
| King | 8 neighbours | no | plus castling (§7) |
| Pawn | per-colour, §6 | no | |

**Sliding algorithm.** From the origin, step by the vector while
`isPlayable(next)`. Stop *after* including a square occupied by a capturable
piece; stop *before* a square occupied by an own or teammate piece; stop when
`isPlayable` is false.

**Occupancy rules.**

- A square holding an **own** piece is never a legal destination.
- A square holding a **teammate's** piece is never a legal destination (Teams
  profile); it blocks sliders exactly like an own piece.
- A square holding an **opponent's live** piece is a capture.
- A square holding a **dead** piece (§10.3) is a capture if
  `deadPiecesCapturable` is true, and blocks sliders regardless.

### 5.1 Corner interaction examples (become test fixtures)

| Fixture | Expectation |
|---|---|
| Rook `a4` moving `(+1,0)` toward rank 3 | no moves in that direction; `a3` is not playable |
| Bishop `d12` moving `(-1,-1)` | stops; `c13` is not playable |
| Queen `d3` moving `(+1,-1)` | stops; `c2` is not playable |
| Knight `d3` -> `c5`, `b4` | legal — destinations playable even though the leap passes over the corner region |
| Knight `d3` -> `b2`, `c1` | illegal — destinations are corner cells |
| Rook `d3` moving `(0,-1)` | stops immediately; `c3` is not playable |

---

## 6. Pawns

### 6.1 Per-colour geometry

| Colour | Forward `(dr, dc)` | Capture vectors | Home line (double step) | Promotion line |
|---|---|---|---|---|
| **Red** (right) | `(0, -1)` | `(-1, -1)`, `(+1, -1)` | `c = 12` (file m) | `c = 3` (file d) |
| **Blue** (left) | `(0, +1)` | `(-1, +1)`, `(+1, +1)` | `c = 1` (file b) | `c = 10` (file k) |
| **Yellow** (bottom) | `(-1, 0)` | `(-1, -1)`, `(-1, +1)` | `r = 12` (rank 2) | `r = 3` (rank 11) |
| **Green** (top) | `(+1, 0)` | `(+1, -1)`, `(+1, +1)` | `r = 1` (rank 13) | `r = 10` (rank 4) |

Pawns never move backward and never capture straight ahead.

### 6.2 Push

- **Single push:** one step along the forward vector, only if the destination is
  playable and **empty**.
- **Double push:** two steps along the forward vector, only if the pawn is still
  on its home line, **both** intervening and destination squares are playable and
  empty. A pawn that has moved is never eligible again, even if it returns to the
  home line (it cannot).
- Controlled by `pawnDoubleStep` (default `fromHomeLineOnly`).

### 6.3 Capture

A pawn captures only onto its two capture vectors, only if the destination is
playable and occupied by a capturable piece (§5). Teammate pieces cannot be
captured and are not legal pawn destinations.

### 6.4 En passant

Enabled by `enPassant` (default **on**).

When a pawn makes a double push, the engine records an **en-passant target**: the
square it skipped over, together with the pawn that skipped it and the ply number.
An enemy pawn whose capture vector reaches that target square may move there and
capture the skipping pawn, which is removed from the square it actually occupies.

- Only a **pawn** can capture en passant.
- Only an **opponent's** pawn (never a teammate's).
- Window: controlled by `enPassantWindow`, default **`oneFullRound`** — the target
  stays available until the pawn that created it is due to move again, so all
  three other players get one chance at it. See [AMB-4](#amb-4).

**Geometric consequence.** A pawn standing on its own promotion line has already
promoted, so it can never be the capturer. This rules out the head-on case: when
Yellow double-steps from rank 2 to rank 4, the only pawns that attack the skipped
rank-3 square from rank 4 would be Green pawns, and rank 4 *is* Green's promotion
line. In practice an en-passant capture is therefore made by a pawn travelling on
the perpendicular axis — for example Green on `k9` taking Red's `m8`-`k8` double
step at `l8`. This is a consequence of AMB-3, not a separate rule.

### 6.5 Promotion

- A pawn that **ends its move** on its promotion line promotes immediately.
- The promotion line is the far edge of the central band from the pawn's point of
  view (`promotionZone: farEdgeOfCentralBand`). For Yellow that is rank 11, Green
  rank 4, Blue file k, Red file d.
- The promotion line spans the **whole** 14-square row/column, including squares
  inside a neighbouring army's home arm. A Yellow pawn that captures its way onto
  `a11` promotes there.
- Promotion is **mandatory** (`promotionMandatory: true`). A pawn cannot decline.
- Choice: Queen, Rook, Bishop or Knight (`promotionPieces`), selected by the
  player (`promotionChoice: player`). The promoted piece belongs to the pawn's
  owner and inherits nothing from the pawn.
- A pawn that reaches the promotion line **cannot advance further** — beyond that
  line, forward pushes are not generated, so a pawn can never overshoot.
- See [AMB-3](#amb-3) for why the promotion line is the 11th rank and not the 14th.

---

## 7. Castling

Enabled by `castling` (default **on**).

Conditions, all required:

1. King and the chosen rook have never moved.
2. All squares strictly between them are empty.
3. The king is not currently in check.
4. The king does not transit or land on a square attacked by any **opponent**
   (teammate attacks are ignored — `castlingConsidersTeammateAttacks: false`).

The king moves two squares toward the rook; the rook jumps to the square the king
crossed. "Short" is the side with the nearer rook (2 squares between), "long" the
side with the farther rook (3 squares between).

| Colour | Side | King | Rook | Must be empty | King transits |
|---|---|---|---|---|---|
| **Red** | short | `n8` -> `n10` | `n11` -> `n9` | `n9 n10` | `n9 n10` |
| **Red** | long | `n8` -> `n6` | `n4` -> `n7` | `n5 n6 n7` | `n7 n6` |
| **Blue** | short | `a7` -> `a5` | `a4` -> `a6` | `a5 a6` | `a6 a5` |
| **Blue** | long | `a7` -> `a9` | `a11` -> `a8` | `a8 a9 a10` | `a8 a9` |
| **Yellow** | short | `h1` -> `j1` | `k1` -> `i1` | `i1 j1` | `i1 j1` |
| **Yellow** | long | `h1` -> `f1` | `d1` -> `g1` | `e1 f1 g1` | `g1 f1` |
| **Green** | short | `g14` -> `e14` | `d14` -> `f14` | `e14 f14` | `f14 e14` |
| **Green** | long | `g14` -> `i14` | `k14` -> `h14` | `h14 i14 j14` | `h14 i14` |

All eight are derived by rotation from the Yellow pair and asserted by test
**T-05c**. No castling square is ever a corner cell.

---

## 8. Attacks, check and legal moves

### 8.1 Attack

Player `P` **attacks** square `s` if `P` has a live piece with a pseudo-legal
move onto `s`, ignoring whether that move would expose `P`'s own king. Pawn
attacks are the capture vectors only, never the push. Castling is never an
attack. Dead pieces never attack (`deadPiecesGiveCheck: false`).

### 8.2 Check

Player `P` is **in check** when `P`'s king stands on a square attacked by at
least one **opponent** of `P`.

- Teammates never give check (`teammateAttacksGiveCheck: false`); a teammate's
  piece cannot capture `P`'s king, so it cannot threaten it.
- Check from two or three different opponents simultaneously is an ordinary,
  supported state (multi-check). Every check must be answered.

### 8.3 Legal move

A pseudo-legal move by `P` is **legal** iff, after applying it to a copy of the
state (including capture, en-passant removal, castling rook transfer and
promotion), `P` is **not** in check.

- `P` is responsible only for its own king (`mustResolveOwnCheck: true`).
- `P` **may** legally make a move that leaves or places its **teammate** in check
  (`mayExposeTeammateKing: true`). The teammate must deal with it on their turn.
- Kings are never captured (`kingCaptureAllowed: false`). A move onto an enemy
  king's square is never generated, because a player is never permitted to end
  their own turn in check, so no king can be en prise at the start of a turn.

This single definition gives pins, discovered checks, double and triple checks
and the legal responses to check (move the king, capture a checker, block a
sliding checker) with no special-case code.

---

## 9. Checkmate, stalemate and game end

For the player to move, with `L` = the set of their legal moves:

| Condition | Name |
|---|---|
| `L` empty **and** in check | **Checkmate** |
| `L` empty **and** not in check | **Stalemate** |

Consequences are profile-controlled — see `onCheckmate`, `onStalemate` in §13,
and §11 / §12.

---

## 10. Elimination

### 10.1 Trigger

A player is eliminated by checkmate, stalemate, resignation or timeout, according
to the profile's `onCheckmate`, `onStalemate`, `onResign`, `onTimeout`.

### 10.2 Turn order

An eliminated player is removed from the active rotation and is skipped forever
after. The turn pointer advances to the next **active** player. Turn advancement
is computed from the active set, never by adding 1 to an index.

### 10.3 Dead pieces

When `eliminatedPieceBehavior` is `remainAsDead` (FFA default):

- The eliminated player's king is **removed** from the board
  (`eliminatedKingBehavior: removed`).
- Their remaining pieces stay where they are and become **dead**.
- Dead pieces never move, never attack and never give check.
- Dead pieces **do** occupy their square and block sliding pieces.
- Dead pieces **can** be captured, scoring their normal value
  (`deadPieceCaptureValue: normal`).

When `eliminatedPieceBehavior` is `removed` (Teams default), all of the
eliminated player's pieces, king included, leave the board at once.

### 10.4 End of game

| Profile | Game ends when |
|---|---|
| Teams | one team has no active players, or `onCheckmate: teamLoses` fires, or a draw condition (§12.4) |
| Free-for-All | at most one active player remains, or a draw condition |

If every remaining active player has no legal move and none is in check, the game
is a **draw** (`allPlayersStalemated: draw`). This guard makes progress
guaranteed and prevents an infinite skip loop under `onStalemate: skipTurn`.

---

## 11. Profile: Standard Teams (`standard-teams@1.0.0`)

- Red moves first; order Red, Blue, Yellow, Green.
- Teams: Red + Yellow vs Blue + Green (see §3.3 and [AMB-1](#amb-1)).
- A player may **not** capture, or move onto, a teammate's piece. Teammate pieces
  block movement exactly as own pieces do.
- A player may not castle through a square attacked by an opponent; teammate
  attacks are ignored.
- Teammates do not give check.
- A player may make a move that exposes their teammate's king.
- **Checkmate:** `onCheckmate: teamLoses` — the game ends immediately and the
  mated player's team loses. See [AMB-6](#amb-6).
- **Stalemate:** `onStalemate: skipTurn` — the stalemated player is **not**
  eliminated; their turn is skipped and they may regain moves later as the
  position changes. See [AMB-7](#amb-7).
- **Resignation / timeout:** `teamLoses` by default.
- **Scoring:** disabled by default (`scoringEnabled: false`). Result is a team
  win/loss/draw. Material counters are still tracked and displayed for
  information.
- **Victory:** the team whose opponents lost.

## 12. Profile: Standard Free-for-All (`standard-ffa@1.0.0`)

- Red moves first; order Red, Blue, Yellow, Green.
- No teams: every other player is an opponent. All four kings can be checked by
  any of the other three players.
- **Checkmate:** `onCheckmate: eliminatePlayer` — the mated player is eliminated,
  their king is removed, their pieces become dead (§10.3). The player who
  delivered mate scores `checkmateBonus`. If several opponents were giving check,
  the bonus goes to the player who made the final move.
- **Stalemate:** `onStalemate: eliminatePlayerWithBonus` — the stalemated player
  is eliminated and **receives** `stalemateBonus` points as compensation, since
  being stalemated is usually not their fault. Their pieces become dead. See
  [AMB-8](#amb-8).
- **Resignation:** the player is eliminated, pieces become dead, no points are
  awarded to anyone (`resignAwardsPoints: false`).
- **Timeout:** identical to resignation.
- **Victory:** highest score when the game ends. The last active player also
  receives `soleSurvivorBonus`. Ties are shared.

### 12.1 Scoring table (defaults, all configurable)

| Event | Points | Option |
|---|---|---|
| Capture a pawn | 1 | `pieceValues.P` |
| Capture a knight | 3 | `pieceValues.N` |
| Capture a bishop | 5 | `pieceValues.B` |
| Capture a rook | 5 | `pieceValues.R` |
| Capture a queen | 9 | `pieceValues.Q` |
| Capture a king | 20 | `pieceValues.K` — unreachable while `kingCaptureAllowed: false`, kept for variants |
| Deliver checkmate | +20 | `checkmateBonus` |
| Be stalemated | +20 to the stalemated player | `stalemateBonus` |
| Sole survivor | +20 | `soleSurvivorBonus` |
| Capture a dead piece | normal piece value | `deadPieceCaptureValue` |
| Promote a pawn | 0 | `promotionBonus` |

Bishops are worth 5, matching rooks, because the long open diagonals of the cross
make them materially stronger than in two-player chess. All scores are integers;
the engine asserts finiteness (invariant INV-5).

**These numbers are our documented defaults, not a transcription of any existing
product's table.** See [AMB-9](#amb-9).

### 12.2 Resignation

Available to the player to move and to a player awaiting their turn. The UI
requires confirmation. Effect is profile-controlled (`onResign`).

### 12.3 Timeout

Clocks are **off by default** (`timeControl: null`) because the base product is
pass-and-play on one device. When a time control is configured
(`{ initialMs, incrementMs }`), a player whose clock reaches zero is treated
exactly as if they had resigned (`onTimeout` mirrors `onResign`). Clock state is
serialised with the game. See [AMB-11](#amb-11).

### 12.4 Draws

| Rule | Default | Definition |
|---|---|---|
| `fiftyMoveRule` | on, `plyLimit: 200` | 200 plies (50 full rounds of 4) with no capture and no pawn move -> draw between all remaining active players |
| `threefoldRepetition` | on, `count: 3` | identical position, side to move, castling rights, en-passant target, and active-player set, occurring 3 times -> draw |
| `insufficientMaterial` | **off** | material draws are not well defined on this board; disabled rather than guessed. See [AMB-10](#amb-10) |
| `allPlayersStalemated` | `draw` | §10.4 |
| `drawOffers` | `unanimous` | all remaining active players must accept |

---

## 13. Rules matrix

Every ambiguous behaviour is a named option with a default per profile and a
test. `T-xx` refers to the test IDs in `testing.md`.

### 13.1 Setup

| Option | Type | Teams | FFA | Test |
|---|---|---|---|---|
| `seating` | map colour -> seat | `{G:top, B:left, R:right, Y:bottom}` | same | T-03 |
| `turnOrder` | colour[] | `[R, B, Y, G]` | same | T-04 |
| `teams` | colour[][] \| null | `[[R,Y],[B,G]]` | `null` | T-10 |
| `backLineOrder` | string | `RNBQKBNR` from owner's left | same | T-03 |

### 13.2 Movement

| Option | Type | Teams | FFA | Test |
|---|---|---|---|---|
| `knightDestinationOnly` | bool | `true` | `true` | T-07 |
| `pawnDoubleStep` | enum | `fromHomeLineOnly` | same | T-06 |
| `enPassant` | bool | `true` | `true` | T-06b |
| `enPassantWindow` | enum | `oneFullRound` | same | T-06b |
| `castling` | bool | `true` | `true` | T-05c |
| `castlingConsidersTeammateAttacks` | bool | `false` | n/a | T-05c |
| `promotionZone` | enum | `farEdgeOfCentralBand` | same | T-15 |
| `promotionPieces` | piece[] | `[Q,R,B,N]` | same | T-15 |
| `promotionMandatory` | bool | `true` | `true` | T-15 |
| `promotionChoice` | enum | `player` | `player` | T-15 |

### 13.3 Legality

| Option | Type | Teams | FFA | Test |
|---|---|---|---|---|
| `mustResolveOwnCheck` | bool | `true` | `true` | T-11 |
| `teammateAttacksGiveCheck` | bool | `false` | n/a | T-10 |
| `mayExposeTeammateKing` | bool | `true` | n/a | T-10 |
| `kingCaptureAllowed` | bool | `false` | `false` | T-11 |
| `captureTeammate` | bool | `false` | n/a | T-10 |

### 13.4 Elimination and result

| Option | Type | Teams | FFA | Test |
|---|---|---|---|---|
| `onCheckmate` | enum | `teamLoses` | `eliminatePlayer` | T-14 |
| `onStalemate` | enum | `skipTurn` | `eliminatePlayerWithBonus` | T-14 |
| `onResign` | enum | `teamLoses` | `eliminatePlayer` | T-16 |
| `onTimeout` | enum | `teamLoses` | `eliminatePlayer` | T-16 |
| `eliminatedPieceBehavior` | enum | `removed` | `remainAsDead` | T-16 |
| `eliminatedKingBehavior` | enum | `removed` | `removed` | T-16 |
| `deadPiecesGiveCheck` | bool | n/a | `false` | T-16 |
| `deadPiecesBlock` | bool | n/a | `true` | T-16 |
| `deadPiecesCapturable` | bool | n/a | `true` | T-17 |
| `allPlayersStalemated` | enum | `draw` | `draw` | T-14 |

### 13.5 Scoring, clocks, draws, limits

| Option | Type | Teams | FFA | Test |
|---|---|---|---|---|
| `scoringEnabled` | bool | `false` | `true` | T-17 |
| `pieceValues` | map | `{P:1,N:3,B:5,R:5,Q:9,K:20}` | same | T-17 |
| `checkmateBonus` | int | `20` | `20` | T-17 |
| `stalemateBonus` | int | `20` | `20` | T-17 |
| `soleSurvivorBonus` | int | `20` | `20` | T-17 |
| `promotionBonus` | int | `0` | `0` | T-17 |
| `deadPieceCaptureValue` | enum | n/a | `normal` | T-17 |
| `resignAwardsPoints` | bool | `false` | `false` | T-17 |
| `timeControl` | obj \| null | `null` | `null` | T-16 |
| `fiftyMoveRule` | obj | `{on, 200}` | same | T-14 |
| `threefoldRepetition` | obj | `{on, 3}` | same | T-14 |
| `insufficientMaterial` | enum | `off` | `off` | — |
| `drawOffers` | enum | `unanimous` | `unanimous` | — |
| `maxMoveHistoryPlies` | int | `2000` | `2000` | T-20 |
| `maxImportBytes` | int | `1000000` | `1000000` | T-20 |

---

## 14. Deviations, ambiguities and open questions

<a id="amb-1"></a>
### AMB-1 — Seating vs. team pairing vs. "opposite" (**blocking, needs your decision**)

The brief asserts three things that cannot all hold:

1. Green top, Blue left, Red right, Yellow bottom (confirmed by the reference image).
2. "Opposite players are teammates."
3. "Red and Yellow form one team; Blue and Green form the other."

**Proof of conflict.** Under (1), the opposite pairs are {Green, Yellow}
(top/bottom) and {Blue, Red} (left/right). Under (3) the teams are {Red, Yellow}
and {Blue, Green}, and Red (right) is adjacent to Yellow (bottom). No relabelling
helps: any symmetry of a square maps opposite pairs to opposite pairs, so no
rotation or reflection of the seating can make an adjacent pair opposite. Related:
the brief's stated turn order Red, Blue, Yellow, Green corresponds to seats
right, left, bottom, top, which is not a rotational (clockwise) cycle either, so
test item 4 ("correct clockwise turn order") also cannot be satisfied as worded.

**Resolutions.**

| | Seating | Teams | Turn order | Keeps | Drops |
|---|---|---|---|---|---|
| **A (chosen default)** | image | R+Y, B+G | R,B,Y,G | image, named teams, literal turn order, team alternation, symmetry/fairness | "opposite"; "clockwise" |
| **B** | image | G+Y, B+R | R,Y,B,G | image, "opposite", clockwise, alternation | named team pairs, literal turn order |
| **C** | Red bottom, Blue left, Yellow top, Green right | R+Y, B+G | R,B,Y,G | "opposite", clockwise, named teams, literal turn order | the reference image's seating |

**Decision taken: Option A**, shipped as the default `standard-teams` profile,
with Option C shipped alongside as `standard-teams-classic` and selectable from
the Rules menu. Option A is the default because it preserves everything explicitly enumerated
except one adjective, and the resulting game is provably fair (§3.3). Option C is
"classic" four-player chess seating and ships as the `standard-teams-classic`
profile. Switching the default is a one-line data change in `src/rules/teams.ts`.

<a id="amb-2"></a>
### AMB-2 — King/queen orientation on the back line

The brief forbids estimating coordinates from the image, so the setup is defined
by a rule: `R N B Q K B N R` read from each army's **own left**, giving exact
90-degree rotational symmetry. Consequence: kings are not on matching files
(Red `n8`, Blue `a7`, Yellow `h1`, Green `g14`). This agrees with the reference
image, where the top army reads `R N B K Q B N R` left-to-right and the bottom
army reads `R N B Q K B N R`.

<a id="amb-3"></a>
### AMB-3 — Promotion line: 11th rank, not the far edge

Pawns promote at the far edge of the **central 8 x 8 band** (Yellow rank 11,
Green rank 4, Blue file k, Red file d), not on the opposite army's back line.
Rationale: the far back line sits inside another player's home arm, is only
reachable on some files, and would make promotion depend on which neighbour is
still alive. The central-band edge is reachable from every file and is equidistant
for all four armies. Alternative `promotionZone: opponentBackLine` is implemented
and tested but is not the default.

<a id="amb-4"></a>
### AMB-4 — En-passant window with four players

Two-player chess allows en passant only on the immediately following move. With
four players the natural generalisations diverge. Default `oneFullRound`: the
skipped square stays capturable until the double-stepping pawn's owner is due to
move again, so each other player gets exactly one opportunity. Alternative
`nextPlyOnly` restricts it to the single next player. Both are implemented and
tested; neither is obviously "correct".

<a id="amb-5"></a>
### AMB-5 — Castling through check from three opponents

A castling king must not transit a square attacked by **any** opponent — with
three opponents this is materially harder than in two-player chess. Teammate
attacks are ignored (a teammate cannot capture you). Recorded because it is a
judgement call, not a transcription.

<a id="amb-6"></a>
### AMB-6 — Teams: checkmate ends the game

Default `onCheckmate: teamLoses` — mating one player ends the game and their team
loses. The alternative (`eliminatePlayer`: the mated player's pieces leave the
board and their teammate plays on alone, two against one) is implemented and
selectable but is not the default, because a 2-v-1 endgame is nearly always
decided already.

<a id="amb-7"></a>
### AMB-7 — Teams: stalemate skips the turn

Default `onStalemate: skipTurn`. In a four-player game a player can be stalemated
temporarily and regain moves once someone else moves, so eliminating them would
be far harsher than in two-player chess. The `allPlayersStalemated: draw` guard
prevents an infinite skip loop.

<a id="amb-8"></a>
### AMB-8 — Free-for-All: dead pieces and stalemate compensation

Two connected judgement calls. (i) An eliminated player's pieces remain on the
board as inert obstacles that can still be captured for points — this preserves
the position's structure and prevents the board from emptying suddenly. (ii) The
**stalemated** player receives the bonus, not the player who stalemated them,
because in a three-attacker game a stalemate is usually a collective accident.
Both are options.

<a id="amb-9"></a>
### AMB-9 — Scoring values are ours

The point table in §12.1 is a documented default of our own, chosen for balance
(bishops raised to 5 for the long diagonals). It is deliberately **not** copied
from any existing product. Every value is configurable.

<a id="amb-10"></a>
### AMB-10 — Fifty-move, repetition and insufficient material

`fiftyMoveRule` counts 200 plies = 50 full rounds. Repetition requires the same
position, side to move, castling rights, en-passant target **and active-player
set**. Insufficient material is **disabled**: with up to four armies and dead
pieces on the board, a correct material-draw test is not well defined, and
guessing one would create false draws.

<a id="amb-11"></a>
### AMB-11 — Timeouts

No clock by default. The base product is four people at one device, where a clock
is usually unwanted. Timeout behaviour is fully specified and tested, but only
takes effect when a time control is configured.

<a id="amb-12"></a>
### AMB-12 — Teammate pieces block

A teammate's piece is not capturable and is not a legal destination; it blocks
sliding pieces exactly like your own. Stated explicitly because "cannot capture a
teammate's piece" alone does not settle blocking.

<a id="amb-13"></a>
### AMB-13 — Promotion inside an enemy home arm

The promotion line spans all 14 files/ranks, so a pawn that captures sideways into
a neighbour's arm still promotes when it reaches the line (e.g. Yellow pawn on
`a11`). Confirmed playable for all four colours: each promotion line has 14
playable squares.

<a id="amb-14"></a>
### AMB-14 — No king capture

Kings are never captured and never removed by capture. A player cannot end their
own turn in check, so no king is ever en prise when a turn begins. Elimination
happens through checkmate/stalemate/resignation/timeout only.

---

## 15. Engine invariants

Asserted continuously in development builds and by property-based tests.

| ID | Invariant |
|---|---|
| INV-1 | No piece occupies a coordinate where `isPlayable` is false |
| INV-2 | A legal move never leaves the mover in check |
| INV-3 | Every **active** player has exactly one king; eliminated players have none |
| INV-4 | The turn pointer always names an active player; eliminated players never appear in the active rotation |
| INV-5 | All scores are finite integers |
| INV-6 | `deserialize(serialize(s))` deep-equals `s` for every valid `s` |
| INV-7 | Move history length never exceeds `maxMoveHistoryPlies` |
| INV-8 | The set of pieces on the board plus captured pieces is conserved across every move and its undo |
| INV-9 | Applying a move never mutates the input state |
