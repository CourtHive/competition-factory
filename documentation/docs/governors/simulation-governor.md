---
title: Simulation Governor
---

```js
import { simulationGovernor } from 'tods-competition-factory';
```

The **Simulation Governor** holds the methods that play a draw out or set one up: completing a draw's matchUps,
recording outcomes by draw coordinates, and building the outcome objects that `setMatchUpStatus` takes. They work on real records and write only through
the engine's own mutations, so they are as useful to a client demonstrating a draw, or to a third party building
scenarios, as to tests. Every method is also on `tournamentEngine` and `competitionEngine` under the same name.

Synthesising tournaments, participants and persons stays in the [Mocks Governor](./mocks-governor.md).

`completeDrawMatchUps`, `generateOutcome` and `generateOutcomeFromScoreString` were mocks-governor methods; the
mocks governor keeps those names, deprecated, until 8.0.0.

---

## completeDrawMatchUps

Complete matchUps within a draw, with optional filters for targeting specific stages and rounds.

Through an engine, pass `drawId` and the engine resolves the draw and its event:

```js
tournamentEngine.completeDrawMatchUps({ drawId, structureIds: [structureId], completeAllMatchUps: true });
```

Called directly (as `mocksEngine` does during generation), pass the record and the draw instead, as below.

### Complete All MatchUps

```js
const {
  drawIds: [drawId],
  tournamentRecord,
} = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }],
});

const event = tournamentRecord.events[0];
const drawDefinition = event.drawDefinitions[0];

const result = mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  completeAllMatchUps: '6-3 6-4', // score string or `true` for random scores
});

console.log(result.completedCount); // 15
console.log(result.remainingCount); // 0: nothing left to play (BYEs and double exits are settled)
```

### Stage Filter

Complete only matchUps within a specific stage (`MAIN`, `CONSOLATION`, `QUALIFYING`):

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'MAIN',
  completeAllMatchUps: '6-1 6-1',
});
```

### Round Filter

Complete only matchUps in a specific round:

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  roundNumber: 1,
  completeAllMatchUps: '6-3 6-4',
});
```

### Structure Filter

Complete only the matchUps of named structures. Omitted, every structure is completed.

```js
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  structureIds: [eastStructureId],
  completeAllMatchUps: true,
});
```

For a round robin, the **container's** `structureId` completes every group, and a **group's** (child)
`structureId` completes that group only; its siblings are left exactly as they were. A matchUp ended
as `DOUBLE_WALKOVER` or `DOUBLE_DEFAULT` is never overwritten. An unknown id matches nothing.

### Combined Filters

Filters can be combined for precise targeting:

```js
// Complete only round 1 of the MAIN stage
mocksEngine.completeDrawMatchUps({
  tournamentRecord,
  drawDefinition,
  event,
  stage: 'MAIN',
  roundNumber: 1,
  completeAllMatchUps: '6-3 6-4',
});
```

### Complete Options

| Parameter              | Type              | Description                                                                         |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `tournamentRecord`     | object            | **Required** — tournament record                                                    |
| `drawDefinition`       | object            | **Required** — draw definition (direct reference from tournamentRecord, not a copy) |
| `event`                | object            | Event containing the draw                                                           |
| `completeAllMatchUps`  | boolean \| string | `true` for random scores, or a score string like `'6-3 6-4'`                        |
| `completionGoal`       | number            | Stop after completing this many matchUps                                            |
| `stage`                | string            | Filter: only complete matchUps in this stage                                        |
| `stageSequence`        | number            | Filter: for multi-sequence qualifying                                               |
| `roundNumber`          | number            | Filter: only complete matchUps in this round                                        |
| `structureIds`         | string[]          | Filter: only these structures; a round-robin group id selects that group only       |
| `randomWinningSide`    | boolean           | Randomize winning side                                                              |
| `matchUpStatusProfile` | object            | Status distribution (see [Outcome Generation](../testing/mocks-engine-outcomes.md)) |

### Lucky Draws

Completion never makes a lucky loser choice. A round fed by a lucky loser keeps an open position until one is
placed, so completion stops before it, and the result names the round whose losers the choice is made from:

```js
const { awaitingLuckySelection } = tournamentEngine.completeDrawMatchUps({ drawId, completeAllMatchUps: true });
// [{ structureId, roundNumber: 2 }]: choose with getLuckyDrawRoundStatus, then complete again
```

**Note:** The `drawDefinition` must be a direct reference from `tournamentRecord.events[n].drawDefinitions[n]`, not a copy returned by engine query methods like `getEvent()`.

---

## applyOutcomes

Records outcomes on a draw's matchUps located by **draw coordinates** rather than by `matchUpId`, each through
`setMatchUpStatus`, in the order given, so a later outcome can name a matchUp an earlier one filled.

```js
const result = tournamentEngine.applyOutcomes({
  drawId,
  outcomes: [
    { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
    { roundNumber: 1, roundPosition: 2, scoreString: '6-2 3-1', winningSide: 2, matchUpStatus: 'RETIRED' },
    { structureOrder: 3, roundNumber: 1, matchUpIndex: 1, scoreString: '6-3 6-3', winningSide: 1 }, // Group 3
  ],
});
// result.appliedMatchUpIds: the matchUps written, in order
// result.skipped: [{ index, reason: 'NOT_FOUND' | 'BYE' }] for outcomes that matched nothing, or a BYE
```

Each outcome locates one matchUp. Every coordinate given must match; those omitted match anything, except `stage`
and `stageSequence`, which default to `MAIN` and `1`. When several matchUps match, `matchUpIndex` picks one (the
first by default), in the order `allDrawMatchUps` returns them.

| Coordinate       | Description                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `stage`          | default `MAIN`                                                                                |
| `stageSequence`  | default `1`                                                                                   |
| `structureId`    | the structure itself                                                                          |
| `structureName`  | e.g. `'East'`, `'Group 2'`                                                                    |
| `structureOrder` | the n-th structure (1-based) in draw order, counting each round robin group: the group number |
| `roundNumber`    |                                                                                               |
| `roundPosition`  |                                                                                               |
| `drawPositions`  | both positions, as they stand when this outcome is reached                                    |
| `matchUpIndex`   | which of several matches, default `0`                                                         |

The result of each is given by `scoreString`, `winningSide`, `matchUpStatus` (default `COMPLETED`),
`matchUpStatusCodes` and `matchUpFormat`, as for [generateOutcomeFromScoreString](#generateoutcomefromscorestring).

An outcome that matches nothing, or matches a BYE, is not an error: it is reported in `skipped` and the rest are
applied. An outcome `setMatchUpStatus` refuses stops the call with that error; the outcomes before it stay applied.

The `outcomes` of a `drawProfile` (`mocksEngine.generateTournamentRecord`) are applied by this method.

---

## generateOutcome

Generates a complete outcome object for a matchUp. See [mocksEngine documentation](../testing/mocks-engine-outcomes.md) for comprehensive details.

```js
const outcome = simulationGovernor.generateOutcome({
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  matchUpFormat: 'SET3-S:6/TB7',
});
```

**Quick Reference:**

- Creates valid outcome object with score
- Supports all matchUp statuses (COMPLETED, DEFAULTED, RETIRED, etc.)
- Generates realistic scores based on matchUpFormat
- Can specify winner or generate randomly
- See full docs for score generation options

---

## generateOutcomeFromScoreString

Generates an outcome object from a score string. See [mocksEngine documentation](../testing/mocks-engine-outcomes.md#generateOutcomeFromScoreString) for comprehensive details.

```js
const outcome = simulationGovernor.generateOutcomeFromScoreString({
  scoreString: '6-4 6-3',
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
});
```

**Quick Reference:**

- Parses score strings into structured outcome objects
- Supports various score formats
- Validates score structure
- See full docs for supported score formats

---

## Related Documentation

- [Mocks Governor](./mocks-governor.md)
- [Outcome Generation](../testing/mocks-engine-outcomes.md)
- [MatchUp Governor](./matchup-governor.md) — `setMatchUpStatus`
