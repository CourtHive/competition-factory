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

## Test isolation

By default vitest gives every test file a fresh module graph, so each file imports, and under coverage instruments,
the whole engine again. On PRs into `dev` (`FACTORY_MATRIX_TIER=pr`, see
[matrix tiers](./exit-propagation-harness.md#matrix-tiers)) most files instead run in the `shared` project, where a
worker keeps its modules from one file to the next. That roughly halves the suite. Checkpoint PRs into `master`, pushes
to `master` and local runs keep every file isolated, so a test that passes only because files share modules cannot
land.

Sharing modules means sharing module state, so a test file must not depend on, or leave behind, global state:

- `src/tests/testHarness/resetGlobalState.ts` runs before every file. It restores the engine's global state that the
  public setters reach: dev context, global log, invoke observer, captured clocks and stamps, the call random source,
  save-draw-deletions and audit flags, deep copy, loaded tournaments, subscriptions, notices and the mutation status.
  It also clears the policy registry and the officiating and sanctioning record stores.
- A file that changes any of that should still restore it itself, and must not start timers or promises it does not
  await: a callback that fires after its test has ended runs inside whichever file comes next.
- Two kinds of file run in the `isolated` project, on every tier:
  - a file that mocks a module (`vi.mock`, `vi.doMock`, `vi.unmock`, `vi.doUnmock`). A module an earlier file already
    loaded is not replaced, so the mock would silently not apply. `vitest.config.mts` finds these files by reading the
    source, so a new mocking file is isolated automatically.
  - a file listed in `ISOLATED_FILES` in `vitest.config.mts`, because it needs state no public setter can clear. Each
    entry gives the reason.

To check a change against the PR configuration locally:

```bash
FACTORY_MATRIX_TIER=pr pnpm test --run
```

## Query purity

A query never writes. In every test run, `src/tests/testHarness/queryPurity.ts` checks each engine call to a query or
a generator for a write to engine state, and fails the test that made it, naming the method and the write:

- a change to the loaded tournament records or the selected tournament;
- a notice handed to the state provider, which the engine delivers to subscribers after any successful call;
- the modified flag set, which stamps the record.

Each method's kind (`query`, `mutation`, `generate`, `engine`) is generated into
`src/tests/testHarness/queryPurity/methodKinds.json` by `pnpm gen:method-kinds`, from the governors' `query`, `mutate`
and `generate` modules. `pnpm check:method-kinds` (part of `verify:generated`) fails when a new engine method has no
kind: export it from its governor's `query`, `mutate` or `generate` module.

The writers found when the check was introduced are listed in `queryPurity/knownWriters.ts`, each allowed only under
the options that cause it, with its disposition. Writes into a copy a query made for itself are not engine state and
pass. A stamp applied because the modified flag was already set when the query began (a direct, non-engine write left
it set) is not counted against the query.

- `QUERY_PURITY=report` records instead of failing, one JSON line per test file in `.query-purity/tally.jsonl`.
- `QUERY_PURITY=0` turns the check off. Its cost on the PR-tier suite is about 3% (paired runs).

## CI shards

CI runs the suite as four coverage shards (`vitest run --shard=i/4`). Vitest's own sharding splits files into
equal counts, so one shard could carry half again as much test time as another. `vitest.sequencer.mts` splits by
recorded duration instead: it sorts files heaviest first and gives each to the least-loaded shard. Every shard
process computes the same assignment, so the shards stay disjoint and together hold every file, which the merged
coverage report relies on.

Durations live in `vitest.shardDurations.json`, one map per [matrix tier](./exit-propagation-harness.md#matrix-tiers).
A file with no recorded duration counts as a light one, so stale durations cost balance, never coverage. A file's
measured time depends on which files shared the runner's CPU with it (one file measured 54 s in one run and 31 s in
the next), so record from several runs: each file keeps the median of its times. For each run, download its
`coverage-blob-node26-*` artifacts into one directory and merge them, then record all the reports together:

```bash
pnpm exec vitest --merge-reports=<dir> --reporter=json --outputFile=report.json --coverage.enabled=false
node scripts/updateShardDurations.mjs pr report-1.json report-2.json report-3.json   # PRs into dev; `full` for checkpoints
```

## Checking documentation contracts

After building the package, run `pnpm verify:docs-model`, `pnpm verify:docs-examples`,
`pnpm verify:docs-imports` and `pnpm verify:docs-methods`. The example check extracts selected
fences from these pages, compiles them strictly against the built declarations and executes their
output checks; it also checks that every public ScoringEngine method has an API heading. It is a
focused gate, not an assertion that every narrative fence is standalone. Model reference regeneration
uses `node scripts/generateModelDocs.mjs`. The Docusaurus build separately validates site syntax/links.
