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

A **feed round** is a round that receives participants through a link as well as from the previous
round. Its matchUps pair a **fed** position with an **advanced** one, and

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

:::caution The numeric shortcut is nearly right, and wrong for DOUBLE_ELIMINATION
Fed positions are usually numbered **below** the first round's block, which makes
"is it lower than the lowest round-1 drawPosition" look like an equivalent, cheaper test. Measured
across two frozen 600-seed windows on both propagation arms it agrees on **113,626 of 113,632** live
cases — and the exceptions are a whole draw type rather than noise.

**DOUBLE_ELIMINATION's Main final is fed from the Backdraw, which shares Main's drawPosition
space.** Its fed positions therefore sit _inside_ the first round's numeric range, and the shortcut
calls them advanced. Use the prior-round test. See [4a](#4a-the-one-exception-double_eliminations-main-final)
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

| rule                                                     | source                                        |
| -------------------------------------------------------- | --------------------------------------------- |
| ascending order, and the reader idioms that depend on it | `getOrderedDrawPositions`                     |
| fed vs advanced, and side resolution                     | `getOrderedDrawPositions`, `getRoundMatchUps` |
| all-holes normalisation                                  | `normalizeDrawPositions`                      |
| the published shape                                      | `addMatchUpContext`, via `definedAttributes`  |
