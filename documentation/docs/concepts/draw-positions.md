---
title: drawPositions
---

A `drawPosition` is a **slot in a structure**. Participants are assigned to slots, matchUps reference
slots, and everything a draw sheet renders is derived from that reference. This page states the
rules that govern the `drawPositions` array — the ones that are load-bearing, easy to violate, and
not obvious from the type.

```ts
matchUp.drawPositions: number[]   // at most two, stored ASCENDING
```

## 1. A drawPosition is unique within a STRUCTURE, and means nothing outside it

Two structures in the same draw both have a drawPosition 3, and they are unrelated. Never compare a
drawPosition against matchUps or `positionAssignments` drawn from a different structure — scope the
collection by `structureId` first.

**Crossing a link goes by participant, never by number.** When a participant moves along a link —
placed into, advanced into, or removed from another structure — resolve who they are from the
SOURCE structure's `positionAssignments`, then find THEIR drawPosition in the target. A number
carried across a link names whoever happens to hold that number on the other side.

`DOUBLE_ELIMINATION` is where this is easiest to get wrong, because its Main and Backdraw structures
both number from 1 and the Backdraw final feeds back into Main: Backdraw 7 and Main 7 are routinely
different participants — or a participant and a bye.

## 2. The array is POSITIONAL: index 0 is side 1, index 1 is side 2

This is the binding between a side and a slot, and several reader idioms across the engine depend on
it:

| idiom                                        | example                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `drawPositions[winningSide - 1]`             | `assignMatchUpDrawPosition`, `sideExitProvenance`              |
| `drawPositions[someIndex]`                   | `directParticipants`, `positionClear`, `assignDrawPositionBye` |
| `indexOf(drawPosition) + 1` as a side number | `doubleExitAdvancement`, `removeOnwardLoserPlacements`         |

None of them fails loudly when the order is wrong. They answer confidently, with the wrong
participant.

**Therefore every writer must leave `drawPositions` ascending.** Removing a position — mapping it to
`undefined` — preserves order and is safe. Substituting one **in place** does not: a positional `map`
that writes a higher position into the first slot produces `[7, 5]`. That is a real defect this
codebase has shipped, reported as `DRAW_POSITIONS_NOT_SORTED`.

## 3. When both positions are present, side 1 is the LOWER drawPosition

A consequence of rule 2 plus the ascending-storage rule. It holds even where fed positions meet
advanced ones in later rounds.

## 4. On a feed round, a lone position may be FED or ADVANCED — and the array cannot tell you which

A **feed round** is a round that receives participants from somewhere other than the previous round
of its own structure — usually through a link from another structure, but not always: a `FEED_IN`
draw reserves its fed positions for **entrants placed directly into a later round**, the ones who do
not have to play round 1, and that structure has no links at all. Its matchUps pair a **fed**
position with an **advanced** one, and

> **fed positions are `{ sideNumber: 1 }`.**

When such a matchUp holds only ONE position, that position may be either the fed one (still waiting
for its opponent to advance) or the advanced one (still waiting to be fed). **They belong on
different sides**, and nothing in the array distinguishes them:

```text
[5]              5 is fed, or 5 advanced?  the array does not say
[5, undefined]   the same question
[undefined, 5]   the same question
```

**The test is structural, not numeric:** a drawPosition present in the **prior round of the same
structure** played its way here and is ADVANCED; one that is absent from the prior round has just
been fed in. `getRoundMatchUps` makes exactly this test when it builds `pairedDrawPositions`, and
`getOrderedDrawPositions` makes it when it resolves sides, so the two agree by construction.

### `feedRound` and `hasFedDrawPosition` are two facts, not one

The paragraph above runs two questions together, and the engine used to answer both with `feedRound`:

| question                                                                                 | flag                 | how it is derived                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| does a position arriving here take side 1, leaving the prior round's advancer on side 2? | `feedRound`          | the round's `matchUpsCount` equals the prior round's — a round that pairs an arrival with an advancer does not halve |
| is a drawPosition **reserved** here for that arrival?                                    | `hasFedDrawPosition` | the same, **and** no `WINNER` link targets the round                                                                 |

They give the same answer everywhere but one place, and that place is
[4a](#4a-the-one-exception-double_eliminations-main-final). Read `feedRound` to order sides; read
`hasFedDrawPosition` to ask whether a slot exists — that is what `side.participantFed` and
`side.participantAdvanced` now mark, and what a caller deciding whether a position can still be fed
into this matchUp must use.

:::info Measured 2026-09-18
Over 111 generated draws — 20 draw types × 9 draw sizes, with **no byes**, so a drawPosition held in
a round beyond the first is a reserved feed slot and nothing else — 521 rounds and 1,739 matchUps:

| discriminator for "this round reserves a fed drawPosition" | misses                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matchUpsCount` equality alone                             | **5** — `DOUBLE_ELIMINATION`'s Main final, at every draw size                                                                                                                                                                                                                                                                                               |
| a `LOSER` link targets the round                           | **4** — `FEED_IN` round 2 at every non-power-of-two size. Its reserved positions are held for **entrants placed directly into a later round** — the ones who do not have to play round 1, seeds among them — so they come from the draw's own entries and the structure has **no links at all**. This is why the answer cannot simply be read off the links |
| count equality **and** no `WINNER` link                    | **0**                                                                                                                                                                                                                                                                                                                                                       |

It is a **round** fact and not a per-matchUp one: 1,739 of 1,739 matchUps agreed with their round.
(The positive control for that number: the same survey over draws **with** byes reports 337
disagreements, because a round-1 bye advances a participant into round 2 at generation.)
:::

:::caution The numeric shortcut is nearly right, and wrong for DOUBLE_ELIMINATION
Fed positions are usually numbered **below** the first round's block, which makes
"is it lower than the lowest round-1 drawPosition" look like an equivalent, cheaper test. Measured
across two frozen 600-seed windows on both propagation arms it agrees on **113,626 of 113,632** live
cases — and the exceptions are a whole draw type rather than noise.

**DOUBLE_ELIMINATION's Main final is fed from the Backdraw, and the Backdraw winner re-enters Main at
the Main drawPosition they already held.** Its fed positions therefore sit _inside_ the first round's
numeric range, and the shortcut calls them advanced. (The Backdraw has its own positions, numbered
from 1 like Main's — overlapping numbers, not shared ones; see [rule 1](#1-a-drawposition-is-unique-within-a-structure-and-means-nothing-outside-it).) Use the prior-round test. See [4a](#4a-the-one-exception-double_eliminations-main-final)
for why that structure is shaped the way it is.
:::

## 4a. The one exception: DOUBLE_ELIMINATION's Main final

`DOUBLE_ELIMINATION` is the only structure in the factory whose feed round has **no reserved fed
drawPosition**, and it is worth knowing about because it looks like a violation of rule 4 and is not
going to be changed.

The Main structure is generated as a feed-in of `drawSize + 1` with
`linkFedFinishingRoundNumbers: [1]` — the only use of that parameter anywhere. It tells
`feedInMatchUps` that the final round is fed **by a link from another structure**, and link-fed
positions are subtracted from the local allocation:

```ts
positionsFed = positionsFed - positionsFedByLinks;
```

So Main asks for `drawSize + 1` and receives `drawSize` positionAssignments. The extra matchUp exists;
the extra slot does not. The Backdraw winner returning to the Main final is placed at whichever Main
drawPosition **they already held**, which is why:

- both of the Main final's positions are ADVANCED by the prior-round test in rule 4 — there is no fed
  position to find;
- its drawPositions are not structurally determined. Measured across 16 winner patterns on a DE 8,
  `Main|4|1` took **11 distinct** drawPosition pairs. A genuine feed round varies only on the advanced
  side; the fed side is a constant.

### Why it stays

Allocating the missing slot produces exactly the layout rule 4 describes — Main `1..9`, round 1 at
`2..9`, the final fed at drawPosition `1`. It also does this:

```text
BEFORE  DE 8/8   Main  assignments 8  participants 8  BYES 0    BYE matchUps: 0
AFTER   DE 8/8   Main  assignments 9  participants 8  BYES 1    BYE matchUps: 2
```

**A full 8-of-8 double elimination acquires a BYE**, and it propagates into the Backdraw. Main is the
ENTRY structure, so any unfilled position in it becomes a bye — a consolation's unfilled positions do
not, because they are fed rather than entered. The suppression is load-bearing: it exists so the feed
slot is not counted as an entry slot.

A real fix would need a reserved feed position that is excluded from the entry pool **and** from bye
assignment — a positioning-layer concept the factory does not have — plus link retargeting, and it
would renumber every Main drawPosition in every DOUBLE_ELIMINATION draw ever stored.

**Nothing depends on the numbering.** Side resolution uses the structural prior-round test, not the
numeric one, so DOUBLE_ELIMINATION hydrates correctly as it stands. Tracked as `P22` on the
CourtHive design-flaws punch list.

### It is still a feed round for SIDE ORDERING, and never for a reserved slot

Both halves of that sentence matter, and conflating them is what the `hasFedDrawPosition` split in
[rule 4](#feedround-and-hasfeddrawposition-are-two-facts-not-one) exists to stop.

**`feedRound` is right here.** The Backdraw winner arriving over the link does take side 1, and the
undefeated main-bracket winner does sit on side 2. Removing the flag from this round moves the lone
position to whichever chunk of the prior round it came from — and the prior round is a single
matchUp, so the pair collapses to one entry and the position lands on side 1, handing a pending
walkover to the side that holds nobody. That is a real regression, reached and reverted while this
was being worked out.

**`hasFedDrawPosition` is false here, and every consumer that asks "is a slot reserved" wanted that
answer.** `getSide` marked an empty side 1 `participantFed` on every Main final in every double
elimination, for a slot that does not exist; `doubleExitAdvancement` then read that mark back as one
half of its condition for admitting a double exit's BYE into the target structure — beside
`feedRound`, which is what set the mark, so the condition tested one fact twice.

## 5. The SHAPE of the array is not information

The engine spells the same occupancy several ways, depending on which writer last touched the
matchUp:

| spelling                            | written by                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `[5]`                               | `removeSubsequentRoundsParticipant` (compacts), `buildFeedRound`                                    |
| `[5, undefined]` / `[undefined, 5]` | `releaseAdvancedDrawPosition`, `positionClear`, `swapWinnerLoser`                                   |
| `[]`                                | `buildRound`, `resetDrawDefinition`, `luckyDrawAdvancement`, and any removal that empties a matchUp |
| absent                              | `pruneDrawDefinition`                                                                               |

**All of them must hydrate identically.** A consumer reads `sides` and has no idea which writer ran.
This is enforced by `drawPositionsRepresentationIndependence.test.ts`, which asserts that every
spelling of every occupancy produces the same sides _and_ that the side is the correct one.

Two corollaries for anyone writing engine code:

- **A hole is not a drawPosition.** `ensureInt` returns `0` for `undefined` and `null`, and
  `isNaN(0)` is `false` — so any test written as `!isNaN(ensureInt(x))` silently accepts a hole.
  Exclude `undefined` and `null` explicitly.
- **Never branch on the array's length or on `allNumeric` / `noNumeric`.** Filter to the real
  positions once, then branch on **how many there are**. `allNumeric` is `true` for a one-element
  array, which is how a compacted lone position used to bypass the feed-round rule entirely.

## 6. A hole is load-bearing only BESIDE a survivor

`[undefined, 5]` keeps 5 on side 2, and compacting it to `[5]` would move 5 to side 1 — so that hole
carries information and is preserved deliberately.

An array of nothing **but** holes carries none: there is no survivor for it to hold a side open
beside. `[undefined]` and `[undefined, undefined]` are therefore normalised to `[]`, through
`normalizeDrawPositions`, which every removal and substitution writer routes through.
`drawPositionsNormalizationBypass.test.ts` fails on any writer that does not.

## 7. `[]` is published as an ABSENT key, and that is the ordinary case

`addMatchUpContext` hydrates through `definedAttributes(obj, undefined, true)`, which **drops empty
arrays**. So a matchUp holding no position carries **no `drawPositions` key at all** on the inContext
matchUp that consumers render from.

This is not an edge case. It is what every unreached matchUp looks like from the moment a draw is
generated — on a 16 draw with every position filled:

| drawType                   | matchUps publishing no `drawPositions` |
| -------------------------- | -------------------------------------: |
| SINGLE_ELIMINATION         |                                7 of 15 |
| DOUBLE_ELIMINATION         |                               11 of 31 |
| FEED_IN_CHAMPIONSHIP_TO_SF |                               10 of 28 |
| COMPASS                    |                               12 of 32 |

**`sides` is always length 2 regardless**, so nothing downstream needs `drawPositions` to know how
many sides a matchUp has.

:::tip For consumers
Read `matchUp.drawPositions` defensively — `?.[n]`, `?? []`, `|| []`. An absent key is normal, not a
fault. And be careful with `.every()`: `[].every(predicate)` is vacuously **true**, so a matchUp
holding no position satisfies every such filter. Check for a non-empty array first if you are
partitioning matchUps.
:::

## Where these rules live in code

| rule                                                     | source                                           |
| -------------------------------------------------------- | ------------------------------------------------ |
| ascending order, and the reader idioms that depend on it | `getOrderedDrawPositions`                        |
| crossing a link by participant                           | `directWinner`, `releaseLinkedWinnerAdvancement` |
| fed vs advanced, and side resolution                     | `getOrderedDrawPositions`, `getRoundMatchUps`    |
| a reserved fed slot vs a round that merely feeds sides   | `getRoundMatchUps`, `getWinnerLinkRoundNumbers`  |
| all-holes normalisation                                  | `normalizeDrawPositions`                         |
| the published shape                                      | `addMatchUpContext`, via `definedAttributes`     |
