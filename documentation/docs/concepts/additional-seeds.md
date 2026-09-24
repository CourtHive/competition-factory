---
title: Additional Seeds
---

Some governing bodies award a seeding to a player whose ranking does not, on its own, reach the
draw's seed count — most commonly a player returning from a long absence under a protected or
frozen ranking. The rule that matters is **how** the seeding is granted: the player is added as an
**extra seed, over and above the draw's normal count**, so that nobody who earned a seeding slot
loses one. A 128-draw with 32 seeds becomes a 128-draw with 32 seeds _plus one_, not a 128-draw
whose 32nd seed has been displaced.

Such rules are typically bounded — a fixed number of events, a fixed number of extra seeds — and
typically do not apply under every rule book a tournament might run under.

## What the factory already did

Seed **positioning** needed no change, and this is worth stating plainly because it is the part
that looks like it would be hard.

`constructPower2Blocks` fills seed blocks in order — `[1]`, `[drawSize]`, `[3,4]`, `[5..8]`, … —
and stops once the seed count is exceeded. Extra seeds therefore consume the **next** block, and
every block below is untouched. Measured on a 32-draw under `POLICY_SEEDING_ITF`:

| seeds             | seedLimit | drawPositions                                |
| ----------------- | --------- | -------------------------------------------- |
| 8 (the threshold) | 8         | 1, 8, 9, 16, 17, 24, 25, 32                  |
| 10                | 10        | the same eight, plus two from the 9–16 block |

BYEs behave too: in a 32-draw with 24 entries and 10 seeds, all eight BYEs pair with seeds 1–8.
BYEs follow seed order, and an additional seed is the lowest-ranked seed.

## What was missing

Producing that count required `enforcePolicyLimits: false` — an **operator override**, unbounded,
per-call, and indistinguishable from a typo. And once produced, nothing recorded _why_ the extra
seed existed. Three pieces close that.

### 1. `additionalSeeds` — the allowance, as a policy

```typescript
const policy = {
  [POLICY_TYPE_SEEDING]: {
    ...POLICY_SEEDING_ITF[POLICY_TYPE_SEEDING],
    additionalSeeds: {
      maxCount: 4,
      bases: ['PROTECTED_RANKING'], // optional; omitted means any basis
    },
  },
};
```

The ceiling becomes `thresholdSeedsCount + maxCount`. A `seedsCount` above the threshold is now
honoured up to that ceiling **with `enforcePolicyLimits` left at its default `true`** — and still
clamped above it. Structural limits are unchanged: `drawSize` and the stage's entry count cap the
count either way.

A policy that declares no `additionalSeeds` clamps exactly where it always did.

### 2. `seedingBasis` — why a seed exists

`SeedAssignment` carries an optional `seedingBasis`:

```typescript
enum SeedingBasisEnum {
  ORGANISER_DISCRETION = 'ORGANISER_DISCRETION',
  PROTECTED_RANKING = 'PROTECTED_RANKING',
  RANKING = 'RANKING',
  RATING = 'RATING',
}
```

Absent means `RANKING` — "the ordinary basis", not "unknown".

It is first-class rather than an extension for the same reason `byeFromPropagation` is:
`removeExtensions: true` is a supported option on `getState` / `getTournament`, so an extension
marker is destroyed by a routine deep copy and its loss is silent. A draw sheet, a results feed and
an audit each need to know that a given seed displaced nobody; without a field they guess, or the
fact lives in free-text `notes`.

### 3. `addAdditionalSeed` — because protections arrive late

`assignSeedPositions` gates on `seedNumber <= seedLimit`. That is correct — its job is to fill an
established set of seeds, not to grow one — but it means a late-accepted entry could only be seeded
by regenerating the draw, discarding every positioning decision already made.

```javascript
const result = tournamentEngine.addAdditionalSeed({
  seedingBasis: seedingBasisConstants.PROTECTED_RANKING,
  structureId,
  participantId,
  drawId,
});
// { success: true, seedNumber: 33 }
```

The new seed takes `seedLimit + 1`, so every seed below keeps its number, its value and its
drawPosition options. The participant is left **unpositioned** — placing them is
`positionSeedBlocks`' job and a separate decision.

It refuses with `ADDITIONAL_SEEDS_EXHAUSTED` once the allowance is spent, and with
`INVALID_PARTICIPANT_ID` for someone not in the draw. **Nothing is mutated on either path**: the
entry and the allowance are checked before `seedLimit` moves, and a failure inside `assignSeed`
restores it.

A seed that would still sit at or below the policy's threshold count is **not** additional and does
not consume the allowance — it is an ordinary seed the structure had simply not yet created.

## Reading the allowance

```javascript
const allowance = tournamentEngine.getAdditionalSeedsAllowance({ drawId, structureId });
// {
//   thresholdSeedsCount: 32,
//   additionalSeedsAllowed: 4,
//   additionalSeedsAssigned: 1,
//   additionalSeedsRemaining: 3,
//   bases: ['PROTECTED_RANKING'],
//   seedLimit: 33,
//   drawSize: 128,
// }
```

`addAdditionalSeed` applies the same arithmetic, so a client that reads this and a server that
writes cannot disagree about the ceiling.

`participantsCount` defaults to the number of positions holding something other than a BYE —
threshold rows match on `minimumParticipantCount`, so it has to be an entry count rather than a
draw size. That default is the entry count once BYEs are placed and the full draw size before
anything is positioned, both of which are right. Pass it explicitly where a stage's entries are the
truth and the board is not.

## Where the basis surfaces

The factory records the basis; three surfaces downstream read it. Worth knowing when deciding
whether recording one is enough, because for most of the questions an additional seed provokes it
is not the record that gets consulted.

**The desk (TMX).** A participant in a draw view is offered _"Seed as additional"_ only where the
allowance has room and they are not already seeded; choosing it asks for the basis from the list
the policy named. Re-opening that participant afterwards reports _"Seeded on protected ranking"_
and withdraws the action. The draw-generation form also offers the counts the allowance permits,
labelled — `9 (+1 additional seed)` — rather than silently rounding a request down to the nearest
power of two.

**The printed draw sheet (pdf-factory).** The seedings table marks a non-ordinary basis with a
footnote reference:

```text
Seed  Player              Nat.
  8   H. Player           ESP
  9 † I. Player           AUS

† Additional seed — protected ranking
```

One marker per distinct basis, so two bases on one draw keep their identities. It is **not** marked
on the entry line inside the bracket: the bracket answers _who plays whom_, the table answers _why
these seeds_, and an entry line already carries name, nationality and an entry-status badge.

Note that entering on a protected ranking and being **seeded** on one are orthogonal facts. A
player may have either, both or neither, and `entryStatus` has no `PROTECTED_RANKING` member — the
entry route and the seeding basis are different fields answering different questions.

**Ordinary seeds are left unmarked**, everywhere. An absent basis means `RANKING`, so marking every
seed would bury the one that is not ordinary — which is the only reason the mark exists.

## What the factory deliberately does not do

- **It does not decide eligibility.** "The player's first eight events of the season" is a counter
  across tournaments; the factory sees one `tournamentRecord`. Entitlement is determined upstream
  and arrives here recorded, as a `seedingBasis`.
- **It does not vary the allowance by draw size.** A body needing different allowances per draw
  size expresses that as separate policies — which is also how a body that permits none under one
  rule book and some under another expresses _that_.
- **It does not police the basis.** `bases` narrows what may _claim_ an additional seed and is
  reported by `getAdditionalSeedsAllowance` so a client can build the right control. The count is
  the binding limit; the basis is recorded, not refused.
- **It ships no governing-body numbers.** The built-in fixtures are unchanged. What a governing
  body permits is that body's decision, not a factory default.

## Not yet covered

- **Qualifying structures.** `getUnseededByePositions` computes `seedLimit % 4` on the qualifying
  path only. A non-multiple-of-four `seedLimit` shifts the overhang slice there; main-draw BYE
  placement is unaffected and is tested.
- **Round robin.** `getSeedGroups` distributes by `roundRobinGroupsCount`, a different path
  entirely, and additional seeds are untested against it.
