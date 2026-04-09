---
title: Swiss
---

## Overview

A **Swiss** draw is a round-based tournament format where participants are paired each round based on current standings rather than a fixed bracket. Inspired by the FIDE Swiss system used in chess, it efficiently determines a ranking for a large field in far fewer rounds than a round robin while giving every participant the same number of games.

In the factory, this draw type is represented by the constant `SWISS`. Internally it builds on the [Ad Hoc](./ad-hoc) structure (no fixed bracket, rounds generated on demand) but adds FIDE-style score-group pairing, repeat-avoidance, floating, and tiebreaker computation.

## Structure

- No fixed bracket or draw size constraints.
- Each round is generated after the previous round's results are entered.
- Participants are grouped by score (win/loss/draw record) into **score groups**.
- Pairing happens within score groups -- participants with similar records play each other.
- Participants who cannot be paired within their score group **float** to an adjacent group.
- No participant is eliminated; everyone plays every round.
- Swiss structures include `positionAssignments` for all participants (one per participant, without `drawPosition` numbers), enabling qualifier reservation and consistent participant tracking across rounds.

```text
Round 1: (seeded pairing -- top half vs bottom half)
  P1 vs P5, P2 vs P6, P3 vs P7, P4 vs P8

Round 2: (score-group pairing)
  [1-0 group]: P1 vs P2, P5 vs P3
  [0-1 group]: P6 vs P8, P7 vs P4

Round 3: (score-group pairing with floating)
  [2-0 group]: P1 vs P5
  [1-1 group]: P2 vs P7, P3 vs P8
  [0-2 group]: P6 vs P4
```

## Use Cases

- Chess-style tournaments where a full round robin is impractical.
- Large fields where you need a definitive ranking in a limited number of rounds (typically `ceil(log2(n))` rounds for `n` participants).
- Rating-based discovery events where the goal is to sort participants by strength rather than crown a single winner.
- Any sport or game where draws (ties) are a valid match outcome.

## Generation

Create a Swiss draw using `generateDrawDefinition` with `drawType: SWISS`:

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawType: 'SWISS',
  drawSize: 16,
});
```

A `SwissPolicy` can be attached to the draw definition as an extension or passed directly to round-generation methods:

```js
const swissPolicy = {
  totalRounds: 5,
  allowDraws: true,
  tiebreakMethods: ['BUCHHOLZ', 'SONNEBORN_BERGER'],
  pairingMethod: 'SCORE_GROUP',
};
```

### SwissPolicy Options

| Property           | Type                              | Default                            | Description                                    |
| ------------------ | --------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `totalRounds`      | `number`                          | --                                 | Planned number of rounds                       |
| `allowDraws`       | `boolean`                         | `false`                            | Whether drawn (tied) matchUps award 0.5 points |
| `tiebreakMethods`  | `string[]`                        | `['BUCHHOLZ', 'SONNEBORN_BERGER']` | Ordered list of tiebreaker methods             |
| `pairingMethod`    | `'SCORE_GROUP' \| 'RATING_BASED'` | `'SCORE_GROUP'`                    | Pairing strategy                               |
| `colorAlternation` | `boolean`                         | `false`                            | Reserved for side-alternation balancing        |
| `hardNoRepeat`     | `boolean`                         | `false`                            | Strictly forbid repeat pairings                |

## Round Generation

Rounds are generated one at a time using `generateSwissRound`:

```js
const result = engine.generateSwissRound({
  drawId,
  scaleName: 'WTN', // rating scale for initial seeding
});

// result: { success, roundNumber, matchUps, byeParticipantId }
```

The function resolves the Ad Hoc structure, collects participant ratings, computes score groups from completed matchUps, generates pairings, and creates a new round of matchUps.

### Parameters

| Parameter        | Type          | Description                                                  |
| ---------------- | ------------- | ------------------------------------------------------------ |
| `drawId`         | `string`      | Target draw definition                                       |
| `structureId`    | `string`      | Optional -- defaults to the first Ad Hoc structure           |
| `scaleName`      | `string`      | Rating scale name for seed ordering (e.g., `'WTN'`, `'ELO'`) |
| `swissPolicy`    | `SwissPolicy` | Override the policy stored on the draw extension             |
| `participantIds` | `string[]`    | Restrict pairing to a subset of participants                 |

## Initial Pairing (Round 1)

When no completed matchUps exist, the first round uses **FIDE-style seeded pairing**:

1. Sort all participants by rating (descending). Ratings come from `adHocRatings`, scale values, or competition policy dynamic form ratings.
2. Split the sorted list into a **top half** and a **bottom half**.
3. Pair the first participant in the top half against the first in the bottom half, the second against the second, and so on.

This ensures that the strongest players do not meet each other in the opening round.

### Odd Participant Count

When the participant count is odd, a **bye** is assigned before pairing. The bye goes to the lowest-rated participant in the lowest score group. In round 1, this is the lowest-rated participant overall. The `byeParticipantId` is returned in the result so the caller can record a forfeit win or handle it as needed.

## Subsequent Rounds

After round 1, pairing shifts to **score-group pairing**:

1. **Compute score groups** -- group participants by their win/loss/draw record, sorted by points descending.
2. **Float odd groups** -- if a score group has an odd number of participants, the lowest-rated participant in that group is floated down to the next group.
3. **Pair within each group** -- within a score group, participants are sorted by rating and paired top-half vs bottom-half (the same FIDE approach used in round 1).
4. **Avoid repeat opponents** -- the algorithm skips previously encountered opponents when selecting a pairing partner. If all available opponents in the bottom half are repeats, the algorithm falls back to the closest available participant.
5. **Catch unpaired participants** -- any participants left unpaired after all groups are processed are paired together as a safety net.

## Standings and Tiebreakers

Use `getSwissStandings` to retrieve ranked standings at any point during the tournament:

```js
const { standings, scoreGroups, roundsPlayed } = engine.getSwissStandings({
  drawId,
  tiebreakMethods: ['BUCHHOLZ', 'MEDIAN_BUCHHOLZ', 'SONNEBORN_BERGER', 'PROGRESSIVE_SCORE'],
});
```

Standings are sorted by **points** (wins = 1, draws = 0.5, losses = 0) with tiebreakers applied in the order specified.

### Tiebreaker Methods

| Constant            | Method            | Description                                                                                                |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `BUCHHOLZ`          | Buchholz          | Sum of all opponents' points. Rewards playing against strong opposition.                                   |
| `MEDIAN_BUCHHOLZ`   | Median Buchholz   | Buchholz with the highest and lowest opponent scores removed. Reduces the impact of outlier opponents.     |
| `SONNEBORN_BERGER`  | Sonneborn-Berger  | Sum of defeated opponents' points, plus half of drawn opponents' points. Rewards beating strong opponents. |
| `PROGRESSIVE_SCORE` | Progressive Score | Cumulative running total of round-by-round point sums. Rewards early wins over late wins.                  |

Tiebreaker constants are exported from `swissConstants`:

```js
import { BUCHHOLZ, MEDIAN_BUCHHOLZ, SONNEBORN_BERGER, PROGRESSIVE_SCORE } from 'tods-competition-factory';
```

### SwissStanding Shape

Each standing entry contains:

```typescript
{
  participantId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  buchholz?: number;
  medianBuchholz?: number;
  sonnebornBerger?: number;
  progressiveScore?: number;
  opponentIds: string[];
  rank: number;
}
```

## Swiss Chart

The **Swiss chart** is a round-by-round visualization of how participants move through score groups as the tournament progresses. Use `getSwissChart` to retrieve the data:

```js
const { rounds, totalRounds } = engine.getSwissChart({ drawId });
```

The result contains an array of rounds (starting with round 0 where all participants are in a single 0-0-0 group). Each round contains **nodes** representing score groups with the participant IDs at that record after that round's results:

```typescript
{
  rounds: [
    { roundNumber: 0, nodes: [{ wins: 0, losses: 0, draws: 0, participantIds: [...] }] },
    { roundNumber: 1, nodes: [
      { wins: 1, losses: 0, draws: 0, participantIds: [...] },
      { wins: 0, losses: 1, draws: 0, participantIds: [...] },
    ]},
    // ...
  ],
  totalRounds: 3,
}
```

This data can be used to render a tree diagram showing participants branching into score groups after each round -- a standard visualization in Swiss-system tournaments.

## Competition Policy Integration

When a **competition policy** is attached to the tournament and draw, `generateSwissRound` can use **dynamic form ratings** instead of static scale values for pairing. If the competition policy's `pairingPolicy.ratingSource` is set to `'DYNAMIC_FORM'`, the engine reads each participant's `dynamicFormRating` from the competition state and uses that as the basis for seeded pairing and within-group ordering.

This enables a three-track rating approach:

1. **Static rating** -- the participant's published rating (WTN, UTR, ELO, etc.) used for initial seeding.
2. **Dynamic rating** -- an ELO-style rating updated after each round based on results (via DrawMatic's `calculateNewRatings`).
3. **Dynamic form rating** -- a competition-specific performance rating derived from the current event's results, suitable for Swiss pairing in multi-format competitions.

## Related

- [Ad Hoc (Flex Rounds)](./ad-hoc) -- The underlying structure Swiss draws build upon
- [DrawMatic](./drawmatic) -- Probabilistic pairing algorithm (alternative to Swiss score-group pairing)
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
- [Generation Governor](/docs/governors/generation-governor) -- API reference for draw generation
