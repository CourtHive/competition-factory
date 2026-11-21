# Refusal invariant triage

The replays use factory dev `c4a629c135`, including the F-005 and F-006 fixes. Each observation counts a step in one capture. The captures share source tests and their counts must stay separate.

| Capture                      | Changed refusals | Real defect | Deliberate injection | Recording artefact |
| ---------------------------- | ---------------: | ----------: | -------------------: | -----------------: |
| Bounded, 7,786 scenarios     |               45 |          18 |                   21 |                  6 |
| Historical, 41,829 scenarios |              118 |          23 |                   25 |                 70 |

The six original suite cases are the stop, resume and end ordering examples in both storage representations. All six are F-007. The broader instrumented suite identified 52 distinct active test identities. The live observation file retains their methods, refusal values, changed paths and pre-call mutation flags. The gate in [#6500](https://github.com/CourtHive/competition-factory/pull/6500) scopes each exception to its source and observed fields.

## What reproduced

Each ledger row has the capture, source, scenario, zero-based step, directive name, observed error, before/after hashes, changed paths, classification and six independent replays. Each replay starts from the verified pre-call hash. It uses either direct dispatch or a one-directive queue with rollback disabled under v1, v2 or differential. Clean production replays also distinguish deliberately injected writer failures from ordinary errors. The fixture-stamp controls additionally observed an already-pending mutation flag on entry.

Six previously defective steps in each archive now pass all six replay controls. F-005 accounts for four and F-006 for two. The active gate still rejects all six if given the old bytes. Its exceptions for current defects should be removed with each fix.

The other 64 historical recording artefacts all have a new capture from the same source test, with the same method and error and an unchanged record. The older collector could include edits between calls in the next recorded step. Independent replays and recapture establish the attribution to the recording boundary. They do not identify the intervening edit in every test. Six inherited-stamp observations in each capture have the narrower fixture explanation.

A fresh capture of the implicated source files produced 6,496 scenarios, 18,592 steps and 1,845 refusals. All 44 changed refusals have an explicit disposition. Three source tests failed in recording mode. One compares two locales and saw different recorded clock instants. Two supply NaN and Infinity, which the canonical encoder rejects. The capture is diagnostic. The complete green suite count for a product fix comes from runs with recording disabled.

## Findings awaiting disposition

- F-007 covers ordering and late assignment refusals. [Scheduling preflight](https://github.com/CourtHive/competition-factory/pull/6503)
- F-008 — A refused bulk outcome leaves an earlier winner. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6504)
- F-009 — A refused ad hoc reset clears an earlier match. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6505)
- F-010 — A refused TEAM replacement modifies the line-up. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6506)
- F-011 — An invalid round stays in its scheduling profile. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6507)
- F-012 — An invalid timing edit removes a category. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6508)
- F-013 — A refused court deletion removes an earlier court. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6509)
- F-014 — A rejected court edit changes the venue. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6510)
- F-015 — An invalid scale date creates participant time items. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6511)
- F-016 — A refused BYE placement changes the draw. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6512)
- F-017 — A missing penalty creates participant penalty arrays. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6513)
- F-018 — An invalid participant creates the participant list. [Fixture and rollback controls](https://github.com/CourtHive/competition-factory/pull/6514)

## Reproduce

Run the raw harvest scanner from the initial #6500 revision, or use the current scanner's JSONL output as the ledger. Pass `HARVEST`, `LEDGER`, `REPLAYS` (output JSONL) and `FIXTURES` (output directory) to `TZ=UTC pnpm exec vitest run --config ext-report/refusal-triage/vitest.config.mts` in the tested factory checkout with this directory copied in. The ledger includes replay controls for all 163 observations. The live test observations and per-finding fixtures permit review without either private harvest directory.
