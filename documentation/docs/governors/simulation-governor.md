---
title: Simulation Governor
---

```js
import { simulationGovernor } from 'tods-competition-factory';
```

The **Simulation Governor** holds the methods that play a draw out or set one up: completing a draw's matchUps,
and building the outcome objects that `setMatchUpStatus` takes. They work on real records and write only through
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

**Note:** The `drawDefinition` must be a direct reference from `tournamentRecord.events[n].drawDefinitions[n]`, not a copy returned by engine query methods like `getEvent()`.

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
