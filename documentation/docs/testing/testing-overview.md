---
title: Testing Overview
---

The Competition Factory provides comprehensive testing utilities and patterns for building reliable tournament management applications. The testing toolkit includes mock data generation, test servers, and best practices for testing tournament scenarios.

## Testing Tools

### mocksEngine - Primary Testing Tool

The **[mocksEngine](./mocks-engine-overview.md)** is the primary tool for generating test data. It creates realistic tournaments, participants, draws, match outcomes, and complete tournament scenarios with full [CODES](/docs/data-standards#codes) schema compliance.

**Quick Start:**

```js
import { mocksEngine } from 'tods-competition-factory';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 32 }],
});
```

**Key Capabilities:**

- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Complete tournaments with events, draws, participants, venues
- **[Participant Generation](./mocks-engine-participants.md)** - Individuals, pairs, and teams with demographics, rankings, ratings
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Match outcomes with realistic scores and statuses
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Complex scenarios, edge cases, and testing techniques

**Learn More:** [Getting Started with mocksEngine](./mocks-engine-getting-started.md)

### factory-server - Test Server

The **[factory-server](./factory-server.md)** provides a lightweight test server for integration testing and development. It simulates backend tournament management without requiring full infrastructure setup.

## Testing Approaches

### Unit Testing

Test individual factory methods in isolation:

```js
import { tournamentEngine } from 'tods-competition-factory';

test('can add participant to tournament', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const participant = { participantName: 'Test Player' };
  const result = tournamentEngine.addParticipant({ participant });

  expect(result.success).toBe(true);
});
```

### Scenario Testing

Test specific tournament scenarios and edge cases:

```js
test('handles BYEs in elimination draw', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        participantsCount: 13, // Creates 3 BYEs
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();

  // Verify BYE handling
  const byeMatchUps = upcomingMatchUps.filter((m) => m.matchUpStatus === 'BYE');
  expect(byeMatchUps.length).toBe(3);
});
```

## Test Data Strategies

### Minimal Setup

Generate only what you need for each test:

```js
// Minimal tournament for testing participant methods
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  participantsProfile: { participantsCount: 10 },
});
```

### Complete Scenarios

Generate fully populated tournaments for integration tests:

```js
// Complete tournament with multiple events, venues, and scheduling
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    { eventType: 'SINGLES', drawProfiles: [{ drawSize: 32 }] },
    { eventType: 'DOUBLES', drawProfiles: [{ drawSize: 16 }] },
  ],
  venueProfiles: [{ courtsCount: 8, venueName: 'Main Stadium' }],
  schedulingProfile: [{ scheduleDate: '2024-06-01', venues: [{ rounds: [{ roundNumber: 1 }] }] }],
});
```

### Progressive Building

Build test data incrementally as needed:

```js
test('can add multiple draws to event', () => {
  // Start with minimal tournament
  const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles: [{ eventName: 'Singles' }],
  });

  // Add singles draw
  mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [{ eventId: eventIds[0], drawProfiles: [{ drawSize: 32, drawName: 'Singles' }] }],
  });

  // Add doubles draw
  mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 16, drawType: 'DOUBLES', drawName: 'Doubles' }],
      },
    ],
  });
});
```

## Testing Best Practices

### 1. Isolation

Keep tests independent and repeatable:

```js
// Good - each test creates its own data
test('test 1', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  // ... test logic
});

test('test 2', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  // ... test logic
});
```

### 2. Meaningful Data

Use descriptive names and values for clarity:

```js
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  tournamentName: 'Test Tournament - BYE Handling',
  drawProfiles: [
    {
      drawSize: 16,
      participantsCount: 13, // Explicit: creates 3 BYEs
      drawName: 'Main Draw',
    },
  ],
});
```

### 3. Test Specific Scenarios

Focus each test on a specific behavior:

```js
test('seeded participants placed in correct positions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        seedsCount: 4,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  // Verify only seeding placement, not other aspects
});
```

### 4. Use Appropriate Completion

Only complete matchUps necessary for your test:

```js
// Test only needs first round complete
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 16,
      outcomes: [{ roundNumber: 1, scoreString: '6-1 6-2', winningSide: 1 }],
    },
  ],
});
```

## Testing Patterns

### Setup Helpers

Create reusable setup functions:

```js
function createStandardTournament() {
  const { tournamentRecord, drawId } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });
  tournamentEngine.setState(tournamentRecord);
  return { tournamentRecord, drawId };
}

test('can get draw positions', () => {
  const { drawId } = createStandardTournament();
  const { structures } = tournamentEngine.getDrawStructures({ drawId });
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    drawId,
    structureId: structures[0].structureId,
  });
  expect(positionAssignments.length).toBe(32);
});
```

### Parameterized Testing

Test multiple scenarios with the same logic:

```js
test.each([
  { drawSize: 8, expectedRounds: 3 },
  { drawSize: 16, expectedRounds: 4 },
  { drawSize: 32, expectedRounds: 5 },
])('draw size $drawSize has $expectedRounds rounds', ({ drawSize, expectedRounds }) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const rounds = Math.max(...matchUps.map((m) => m.roundNumber));

  expect(rounds).toBe(expectedRounds);
});
```

## Measuring notice coverage

The notice-conformance catalog (`src/tests/mutations/notifications/noticeConformance`) checks a fixed set of mutation
scenarios. To check **every** engine call the suite makes, run the suite with the opt-in harness:

```bash
NOTICE_COVERAGE=1 pnpm vitest run          # ~10 minutes; appends one JSON line per test file
node scripts/noticeCoverageReport.mjs      # methods that changed the record without a covering notice
node scripts/noticeCoverageReport.mjs --unreached   # engine methods no test dispatches through an engine
node scripts/noticeCoverageReport.mjs --json        # the same summary as JSON
```

The tally goes to `.notice-coverage/tally.jsonl` (git-ignored); `NOTICE_COVERAGE_OUT` overrides the path. For each
call that changed a record, the harness diffs the record before and after and applies the same rules as the catalog.
A call is **silent** when it changed the record and buffered no notice at all, and **violating** when a changed entity
was covered by no notice. A call made with `disableNotice: true` asked for no notice and is not measured.

The harness subscribes to every topic, because many mutations build a notice only when its topic has a subscriber. A
handful of tests that assert behaviour gated on having **no** subscribers (audit trails, draw-deletion records) fail
under it by design; they pass in the ordinary run.

## Resources

### Documentation

- **[mocksEngine Overview](./mocks-engine-overview.md)** - Comprehensive testing tool
- **[Getting Started](./mocks-engine-getting-started.md)** - Quick start guide
- **[Tournament Generation](./mocks-engine-tournament-generation.md)** - Full tournament creation
- **[Participant Generation](./mocks-engine-participants.md)** - Creating participants
- **[Outcome Generation](./mocks-engine-outcomes.md)** - Match outcomes and scores
- **[Advanced Patterns](./mocks-engine-patterns.md)** - Complex testing scenarios
- **[factory-server](./factory-server.md)** - Test server for integration testing

### Related

- **[Governors Overview](../governors/governors-overview.md)** - Methods available for testing
- **[Mocks Governor](../governors/mocks-governor.md)** - Anonymize and modify tournaments
- **[Tools Overview](../tools/tools-overview.md)** - Utility functions for tests

---

## Scoring format conformance

Work released in 7.16.0 (#5523/#5524/#5526 and follow-ups) adds independently authored rule cases alongside
replay/round-trip checks. At revision `97ad4dbe` (2026-10-17), the harvest contained 263 format codes
in 79 cells: 75 conformance-backed, four deliberately refused input-level cells, none classified as
missing. This is a revision-bound inventory, not a universal zero-defect proof.

`src/tests/scoring/conformance/formatMatrix.ts` maps cells to rule cases. `formatMatrix.test.ts`
rejects missing/unreachable classifications; conformance cases use rule-authored outcomes rather
than another engine path as the oracle. Run:

```sh
TZ=UTC pnpm exec vitest run src/tests/scoring/conformance --maxWorkers=2
```

Refused cells describe point/game input the scorer cannot model, such as outs segments supplied as
set totals. Unharvested formats, arbitrary new combinations, host clocks, non-scoring side-out rallies,
doubles participant rotation and external roster enforcement are outside this inventory's proof.
Scoring conformance does not prove tournament exit propagation. See
[format support](../scoring-engine/format-support.md) and
[adoption notes](../whats-new-7.0.0.md#adoption-notes-7160).

## Checking documentation contracts

After building the package, run `pnpm verify:docs-model`, `pnpm verify:docs-examples`,
`pnpm verify:docs-imports` and `pnpm verify:docs-methods`. The example check extracts selected
fences from these pages, compiles them strictly against the built declarations and executes their
output checks; it also checks that every public ScoringEngine method has an API heading. It is a
focused gate, not an assertion that every narrative fence is standalone. Model reference regeneration
uses `node scripts/generateModelDocs.mjs`. The Docusaurus build separately validates site syntax/links.
