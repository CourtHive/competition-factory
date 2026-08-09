---
title: Round Robin Pairing (Shapes)
---

## Overview

A round robin is a **pairing shape** — every entrant meets every other entrant — and that shape can be
applied by _round generation_ as well as by a draw structure. The two are different tools:

|                     | [`ROUND_ROBIN` draw type](./round-robin)                    | `pairingProfile` on an [`AD_HOC`](./ad-hoc) draw |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Produces            | groups, each a container structure with positioned entrants | rounds of matchUps, no groups                    |
| Groups              | splits the draw into groups of `structureOptions.groupSize` | none — one schedule over all entrants            |
| Repeat meetings     | one meeting per pair                                        | `encounters: 2`, `3`, …                          |
| Partial schedule    | no — the full pairing set is materialized                   | yes — `roundsCount` truncates                    |
| Finishing positions | derived from group tallies                                  | none — rounds are independent                    |

Use the draw type when the competition is organized into groups that produce finishing positions. Use a
pairing shape when the competition is a **league**: one division, everyone plays everyone, possibly twice,
possibly only partway through the season.

## Applying a shape

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  drawSize: 8,
  eventId,
  pairingProfile: {
    shape: 'ROUND_ROBIN',
    encounters: 2, // double round robin
    mirrored: true, // default — alternating encounters swap side order
  },
});
```

| Field        | Type      | Default | Description                                                                          |
| ------------ | --------- | ------- | ------------------------------------------------------------------------------------ |
| `shape`      | `string`  | —       | `ROUND_ROBIN` is the shape currently supported                                       |
| `encounters` | `number`  | `1`     | How many times each pair meets. `2` is a double round robin, `3` a triple            |
| `mirrored`   | `boolean` | `true`  | Swap side order on alternating encounters, making a double round robin home-and-home |

A `roundsCount` supplied alongside a `pairingProfile` truncates the schedule to a **partial** round robin
(see below) rather than setting the number of rounds outright.

## The schedule

The shape produces `entrants - 1` rounds per encounter, each round containing `floor(entrants / 2)`
matchUps. Over a single encounter every pair meets exactly once — `C(n, 2)` matchUps in total.

With an **odd** number of entrants, one participant sits out each round: the circle method pairs against a
bye position, and the resulting pairing is omitted. Eight entrants give 7 rounds of 4; five entrants give 5
rounds of 2.

The schedule comes from the same circle method the `ROUND_ROBIN` draw type uses to order group matchUps, so
both paths agree on which meetings belong to which round.

### Encounters and mirroring

`encounters: 2` replays the whole schedule a second time. With `mirrored: true` (the default) the second
cycle swaps side order, so a pair that met with `[A, B]` in round 1 meets as `[B, A]` in round
`entrants`. That side order is what carries home-and-away meaning for league scheduling; set
`mirrored: false` to keep side order stable across encounters.

### Partial round robins

Not every league division completes its schedule — entrants withdraw, or a flight is too large for the
season. Supplying `roundsCount` alongside a `pairingProfile` materializes only the first N rounds:

```js
engine.generateDrawDefinition({
  drawType: 'AD_HOC',
  drawSize: 12,
  eventId,
  pairingProfile: { shape: 'ROUND_ROBIN' },
  roundsCount: 4, // the first 4 rounds of an 11-round schedule
});
```

Because only the meetings that occur are generated, an unplayed matchUp in a partial schedule is
distinguishable from a meeting that was never scheduled at all.

## Unsatisfiable requests are reported

A request the shape cannot satisfy returns `INVALID_VALUES` rather than being quietly reduced to whatever
happened to be possible:

- a `roundsCount` greater than `(entrants - 1) × encounters`
- an `encounters` value that is not a positive integer
- an unrecognized `shape`
- fewer than two entrants

## Relationship to DrawMatic and Swiss

All three pair participants into ad-hoc rounds, and they answer different questions:

- **[DrawMatic](./drawmatic)** pairs by rating, avoiding repeat opponents probabilistically. It does not
  guarantee that every entrant meets every other — with `enableDoubleRobin` it will schedule up to
  `(entrants - 1) × 2` rounds, but the pairings are rating-weighted, not a replayed schedule.
- **[Swiss](./swiss)** pairs each round from the current standings, so the schedule cannot be known in
  advance.
- **A round robin shape** is fully determined before play begins, which is what a published league fixture
  list requires.

## Related

- [Ad Hoc (Flex Rounds)](./ad-hoc) -- the draw type a pairing shape applies to
- [Round Robin](./round-robin) -- the grouped draw-structure alternative
- [DrawMatic](./drawmatic) -- rating-weighted ad-hoc pairing
- [Swiss](./swiss) -- standings-driven ad-hoc pairing
- [League Profiles](/docs/testing/mocks-engine-league-profiles) -- generating shaped leagues with mocksEngine
- [generateDrawDefinition](/docs/governors/generation/generateDrawDefinition) -- API reference
