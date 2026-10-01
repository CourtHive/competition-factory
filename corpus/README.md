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

## Known failures

A scenario may carry `knownFailure: "<tracker ref>"`. It pins what the engine does today, not what
it should do. A port is not graded against it, and fixing the engine updates the scenario in the
same PR; `verify:corpus` (C3) reports those updates by scenario id.
