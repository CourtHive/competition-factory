# The golden corpus

The language-neutral specification of the engine's behaviour, as data: for each scenario an
initial CODES tournament record, a sequence of directives, and after each directive the result the
engine returned and the state it left. A second implementation, in any language, replays the
directives and compares. Plan and rationale: `Mentat/planning/CORPUS_SPEC_AND_PORTS_PLAN.md`.

## Files

| file                 | what                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `corpus.schema.json` | the envelope, closed. A scenario a port cannot parse pins nothing.                             |
| `INVARIANTS.md`      | the vocabulary the schema's `invariants` and `properties` enums name, quoted from the harness. |
| `*.jsonl.gz`         | scenarios, one per line, by source (not yet written: C1c builds the writer).                   |
| `MANIFEST.txt`       | `scenarioId  hash-of-final-state` per line, plain text, so a PR diff names what moved (C3).    |

The writer and both replayers live under `src/tests/testHarness/corpus/` (`writeScenario.ts`,
`replayScenario.ts`, `applyPatch.ts`, `hash.ts`): harness code, because hashing needs node's crypto
and the published bundle stays browser-safe. `src/tests/corpus/scenarioRoundTrip.test.ts` is the
proof that one scenario round-trips both ways and is byte-identical when written twice.

## Canonical form

Every hash and every patch is computed over the **RFC 8785** (JCS) text of the state:
`src/tools/canonicalJson.ts` in this repository, a conforming library elsewhere. Hashes are
`sha256:` plus 64 lowercase hex digits over that text. Hashing is done by the writer under the test
harness, never in the published bundle, which stays browser-safe and dependency-free.

**The factory stamp's `version` is not hashed.** Every mutation stamps the factory version on the
record's root `factory` attribute (an extension named `factory` in a legacy record). Before hashing,
remove `version` from that one object, and from nothing else. The patches still carry it. Without this,
a hash moved whenever `package.json`'s version did, and no behaviour had: a release bump or a
`dev`→`master` checkpoint failed the manifest gate on that alone (`hash.ts`, `withoutFactoryVersion`).

## Steps

A step is `directive` → `result` → `patch` → `hash`. The patch is RFC 6902 from the previous
canonical state (the initial record for step 0); the hash is of the whole state after. A refused
directive has an `error` result, an empty patch and an unchanged hash. A consumer may either apply
the patches and check the hashes (a reader) or run its own engine and compare its state's hash
(a second implementation).

## Identity: the one piece of corpus logic a consumer implements itself

Directives carry the ids the TypeScript engine consumed. A port that generates its own ids cannot
match them, so each step that targets a matchUp also carries `coordinates`: the structure name,
round number and round position, which are structural and identical across implementations.

Before comparing, a port **normalises ids**: it walks its own state and the expected state in
parallel by structure, round and position, builds the map from expected id to its own id for every
id-bearing field (`tournamentId`, `eventId`, `drawId`, `structureId`, `matchUpId`, `participantId`,
`venueId`, `courtId`, and the `*Id` references that point at them), rewrites the expected canonical
state through that map, and only then hashes. A port that preserves ids (one that loads the
initial record verbatim) skips this and compares directly.

Worked example: expected step 3 writes `winnerMatchUpId: "7c1e…"` on the matchUp at
`MAIN / round 1 / position 2`. The port's matchUp at that address has id `m-0002` and its
successor at `MAIN / round 2 / position 1` has id `m-0005`. The map contains `"7c1e…" → "m-0005"`,
the expected state is rewritten, and the hashes agree.

## Harvesting the test suite (C2a)

```bash
pnpm corpus:record                 # CORPUS_RECORD=1 TZ=UTC vitest run
CORPUS_OUT=/somewhere pnpm corpus:record
```

With `CORPUS_RECORD=1`, a setup file (`src/tests/testHarness/corpusRecord.ts`) installs the
recorder (`src/tests/testHarness/corpus/recorder.ts`) for the whole run. It listens to every engine
call through `globalState.setInvokeObserver`, the one hook every method execution reports to:
`before` with the caller's params, `after` with the result, once the engine's own post-processing
has run. Only **core methods** are recorded: the `mutate` and `generate` exports of the scoring,
matchUp, draws and entries governors, plus the generation and matchUpFormat governors, derived from
those modules at runtime (`coreMethods.ts`). Queries are never recorded.

For each test, the first core call captures the single tournament record in state as the initial
state; every core call after that is a step. Each step also records where the engine's clock and
random stream stood as the call began, so a replay restores both and need not repeat the reads a
test made in between. The clock ticks one millisecond per read from the real present, so
comparisons with the wall clock stay true and successive stamps stay distinct. A test that moves on
to a different record set yields several scenarios (`…/part-N`); a test with zero or several
records at its first core call is skipped and counted with the reason.

Output is **never committed**: one JSONL file per test file under `.corpus-out/` (ignored), plus
`_summary.jsonl` with per-file counts of tests, scenarios, steps, bytes, skips and schema-invalid
scenarios with the first error each. The run is opt-in and leaves the ordinary suite untouched;
a handful of tests that use fake timers or assert on wall-clock expiry fail under recording, and
their scenarios are simply not produced.

## The real-record fixtures as sources (C2c)

```bash
pnpm corpus:fixtures          # .corpus-out/fixtures/fixtures.jsonl, one scenario per fixture
```

`src/tests/testHarness/corpus/fixtureSources.ts` turns each of the sixteen `*.codes.json` records
under `src/tests/testHarness/` into a scenario whose initial state is the record itself, with one
authored probe: score the first playable matchUp, then clear it. When the clear restores the initial
hash the scenario records `DO_UNDO_IDENTITY`. These are records real tournaments produced, with
shapes mocks never emit; a reader that parses all sixteen has parsed the wild. The harness tests
that already drive these fixtures are harvested by the recorder and are not repeated here.

## The oracles as sources (C2b)

```bash
pnpm corpus:oracles                        # matrix, stall-budget policy arm, census, route flips
SEED_COUNT=50 CORPUS_FLIPS=3 pnpm corpus:oracles
```

`src/tests/testHarness/corpus/oracleSources.ts` runs each existing oracle unchanged under the
recorder and names what it did: `oracle/matrix/<cell>`, `oracle/stall-budget/<cell>`,
`oracle/census/<drawType>-<size>/seed-<n>`, `oracle/route/<drawType>-<n>/play-forward` and
`…/flip-<i>` (a flip replays twice, so it arrives as parts). Each scenario's `source.ref` says how
to regenerate it. `src/tests/corpus/oracleSources.test.ts` always records a smoke slice of every
oracle to a temp dir and requires each scenario to validate, read back and replay; the full write
runs only with `CORPUS_ORACLES=1` and goes to `.corpus-out/oracles/`, ignored.

## The grammar as a direct source (C4a)

```bash
pnpm corpus:grammar        # .corpus-out/grammar/grammar.jsonl
```

`parse`, `stringify`, `isValidMatchUpFormat` and `isAggregateFormat` are pure, and tests call them
directly, so the harvest never saw them. `src/tests/testHarness/corpus/grammarSource.ts` writes
them as directives with the **return value recorded** (`SuccessResult.value`; absent means
`undefined`) for every fixture format, every format the harvest contains, and an authored list of
edge and invalid codes: four steps per code. `GRAMMAR_ROUND_TRIP` is recorded when
`stringify(parse(code)) === code`. A port's grammar is checked by recomputing the values; the
reader path is trivial here, the patches are empty.

## The scoring engine as a direct source (C4b)

```bash
pnpm corpus:scoring        # .corpus-out/scoring/scoring.jsonl
```

`createMatchUp` and `addPoint` are pure, point-by-point, and act on a scoring matchUp rather than
a tournament record. `src/tests/testHarness/corpus/scoringSource.ts` writes seeded point streams
(fair, side-1-heavy, side-2-heavy; three seeds) through eight formats, recording at every point
the engine's observable as the step's value: sets, score strings, winning side, completeness. The
last step carries the whole matchUp once. One point is added after the match ends and recorded as
it is. A port replays by chaining the values. `calculatePointsTo` and `inferServeSide` take internal
format structures and are not corpus directives.

## Authored scenarios for the spec (C4c)

```bash
pnpm corpus:authored       # .corpus-out/authored/authored.jsonl
```

`src/tests/testHarness/corpus/authoredSources.ts` holds one short scenario per rule the
outcome-pipeline spec marks UNPINNED or states as a guarantee, each naming the spec section it
pins. The test asserts the result code of every step: the scenario is the pin, the assertion is the
claim, and an engine that answers differently fails the test as a finding. A `?` expectation is a
rule the page leaves open; what the engine does is recorded and printed for the page's next
revision.

## Authored scenarios for the scheduling pipeline

```bash
pnpm corpus:scheduling     # .corpus-out/scheduling/scheduling.jsonl
SCHEDULING_PROPERTIES=/tmp/sp.jsonl pnpm vitest run   # check every scheduling call the suite makes
```

`src/tests/testHarness/corpus/schedulingSources.ts` holds one scenario per scheduling rule
(`Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md` § 5): a generated record, the directives that build a
scheduling profile and run a scheduler, and claims on the record the patches rebuild. Every scenario
claims the four scheduling step properties (`INVARIANTS.md`), and the writer checks them after each
step and refuses a scenario that breaks one. A scheduling call's step records its **deferral report**
as `result.value` (`src/tests/testHarness/scheduling/schedulingReport.ts`): per date, what was
scheduled and, per reason, which matchUps were left unscheduled. A reason for not writing has no
patch to carry it, so the report is what pins it, and it moves the manifest's results hash. When a
timed scheduler times a matchUp already on the court grid, the report also keeps the grid's conflicts
its times made (`proConflicts`, per date, each issue with the matchUps it names); a call that made
none records nothing for it, so the reports of calls that never touch the grid are unchanged.

A scenario with `knownFailure` pins a recorded defect: the test requires its claims to FAIL, so
fixing the defect fails the test until the `knownFailure` is removed in the same PR.

With `SCHEDULING_PROPERTIES=<file>`, a setup file (`src/tests/testHarness/schedulingProperties.ts`)
checks every `scheduleProfileRounds`, `scheduleMatchUps`, `scheduleProfileGrid` and
`proAutoSchedule` call in the run against the same properties, and appends one line per test file:
the calls checked by method, and every violation with its test. Opt-in; the ordinary suite is
untouched. The sweep also asks the report properties (`SCHEDULE_ACCOUNTED`, `SCHEDULE_REPORT_TRUE`)
of each call. Under it, `global/paramsCopiedOnlyWhenRead.test.ts` fails by construction: it asserts
that params are copied only when nothing observes the call, and the sweep is an observer.

## Generated tournaments: the method lists

```bash
pnpm corpus:mocks          # .corpus-out/mocks/mocks.jsonl
```

`src/tests/testHarness/corpus/mocksSources.ts` writes one scenario per shape in `mocksScenarios.ts` (draw types,
event types, flights, qualifying, leagues, venues, scheduling, policies, extensions): the tournament's method list
from `generateTournamentRecord({ recordMethods: true })`. The initial record is the tournament `newTournamentRecord`
makes; the directives are the rest of the list, the engine calls a client makes to build that tournament
(participants, events, entries, draws, results, venues, schedules), with random steps given as their results. So a
consumer graded on this source is graded on building tournaments. Generation runs under the source's fixed clock, so
a run is byte-identical to the last; the initial record is made an hour before it (see "The starting records" below).
The writer gives the engine a copy of each directive's params, so a write that
keeps what it is given (`addDrawDefinition` attaches the draw) cannot change the directive the scenario stores.

## The scheduling scale source

```bash
pnpm corpus:scheduling-scale      # .corpus-out/scheduling-scale/scheduling-scale.jsonl, the whole matrix
SCHEDULING_SCALE_FAILURES=/tmp/f.json pnpm corpus:scheduling-scale   # keep every refused cell's reason
```

`src/tests/testHarness/corpus/schedulingScale.ts` runs a matrix of generated configurations (draw type × size × BYEs ×
venues × daily limits × days: 288 cells) through `scheduleProfileRounds` and then `scheduleProfileGrid`. Every cell
claims every scheduling property, so a refused cell is a scheduler breaking one, named by cell and property. A smoke
slice (one cell per draw type) runs in the ordinary suite; the whole matrix is opt-in and is not in the manifest gate.

The scheduling source writes a sample of it into the manifest: every seventh cell (`pinnedScaleCells`), and the
cells larger than the matrix (`largeScaleCells`: every draw type at 64 and 128, with and without BYEs). The large
cells are the only ones whose grid sorts 64 matchUps or more at once, where the sort merges runs instead of
insertion-sorting one, so they pin the order a comparator leaves to the sort.

## The hash manifest (committed)

```bash
pnpm corpus:manifest          # regenerate corpus/MANIFEST.txt from the three reproducible sources
pnpm verify:corpus-manifest   # the merge gate: fails when a hash moved and the manifest did not
```

The scenarios stay out of git; their hashes do not. `corpus/MANIFEST.txt` holds one line per
authored, scheduling, grammar and scoring scenario: id, step count, the hash after the last step. Those four
sources reproduce bit for bit (the authored and scheduling starting records are built on a fixed clock for
exactly this, and the grammar source reads only the fixture and edge formats unless
`CORPUS_GRAMMAR_HARVEST` asks it to harvest the recorded corpus, which `corpus:verify` does). A behaviour change moves a hash, the gate names every scenario that moved, and the
fix is either the engine or a deliberate regeneration committed with the change.

## The starting records

The authored, scheduling, scheduling scale and mocks sources build their starting records at `RECORD_CLOCK`
(`src/tests/testHarness/corpus/recordClock.ts`), one hour before the clock their steps run at. A record built at the
step clock already carries the factory stamp (`timeStamp`) every write would give it, so a consumer that never stamps
the records a call modifies would replay every scenario to the same hashes. Built earlier, the first write must move it.

## Coverage, and what "100%" means (C3)

```bash
pnpm corpus:verify     # fixtures + oracles + record, then coverage, then the ratchet
pnpm corpus:coverage   # just the report over whatever is in .corpus-out
```

Coverage of the corpus is not statements. It is: **every core method has at least one scenario,
and every error code a core method can refuse with has been observed as a step result.**
`src/tests/testHarness/corpus/coverage.ts` reads every scenario the sources wrote and reports,
per core method, its scenarios, steps, sources, the error codes observed, and the codes its own
file declares (the constants it imports) but nothing has produced. Declared codes are read from the
method's file only, so helper-originated refusals show as observed-but-undeclared; that under-count
is reported, not hidden.

`scripts/verify/corpus-coverage.mjs` ratchets the report against
`scripts/verify/baseline/corpus-coverage.json`, the one corpus artifact git tracks: methods with a
scenario may not fall to zero, and a method's observed codes may not shrink. Headroom to 100% is
printed as the list of methods at zero and the codes never observed, not as a percentage.

## Known failures

A scenario may carry `knownFailure: "<tracker ref>"`. It pins what the engine does today, not what
it should do. A port is not graded against it, and fixing the engine updates the scenario in the
same PR; `verify:corpus` (C3) reports those updates by scenario id.
