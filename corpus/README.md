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

## Steps

A step is `directive` → `result` → `patch` → `hash`. The patch is RFC 6902 from the previous
canonical state (the initial record for step 0); the hash is of the whole state after. A refused
directive has an `error` result, an empty patch and an unchanged hash. A consumer may either apply
the patches and check the hashes (a reader, which is what the Rust consumer does) or run its own
engine and compare its state's hash (a port).

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

`src/tests/testHarness/corpus/fixtureSources.ts` turns each of the sixteen `*.tods.json` records
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

## The hash manifest (committed)

```bash
pnpm corpus:manifest          # regenerate corpus/MANIFEST.txt from the three reproducible sources
pnpm verify:corpus-manifest   # the merge gate: fails when a hash moved and the manifest did not
```

The scenarios stay out of git; their hashes do not. `corpus/MANIFEST.txt` holds one line per
authored, grammar and scoring scenario: id, step count, the hash after the last step. Those three
sources reproduce bit for bit (the authored starting records are built on the corpus clock for
exactly this, and the grammar source reads only the fixture and edge formats unless
`CORPUS_GRAMMAR_HARVEST` asks it to harvest the recorded corpus, which `corpus:verify` does). A behaviour change moves a hash, the gate names every scenario that moved, and the
fix is either the engine or a deliberate regeneration committed with the change.

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
