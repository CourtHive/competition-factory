---
title: Performance Evidence and Measurement
---

## What improved across 7.x

Factory reduced repeated hydration, parameter copies, graph scans, venue/participant assembly and
tally work. These are historical paired measurements, not fresh benchmarks of the current branch.
Release membership follows the first 7.x tag containing the change. See the
[7.x overview](../whats-new-7.0.0.md#performance-across-7x) for the short account.

| First release / status | Change and workload                                                                                                                                                         | Recorded before → after                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.5.0                  | [#5084](https://github.com/CourtHive/competition-factory/pull/5084), [#5086](https://github.com/CourtHive/competition-factory/pull/5086): fixed 2,026-call scoring workload | Hydrations 6,034 → 3,408 (43.5% fewer); median 2 → 1, worst 14 → 8. `positionTargets` calls 89,071 → 20,459 (77.0% fewer).                                                                                                                 |
| 7.5.0                  | [#5098](https://github.com/CourtHive/competition-factory/pull/5098): 456 in-context lookups / TEAM-line scores                                                              | Lookup total 926 → 142 ms (6.5×); line median 12.95 → 8.88 ms (31.4% lower). Downstream target calls 12,059 → 9,874 overlap this workload.                                                                                                 |
| 7.10.0                 | [#5356](https://github.com/CourtHive/competition-factory/pull/5356): 168 scheduled / 504 total matchUps                                                                     | Readiness about 1,270 → 5 ms; participant rest about 1,290 → 26 ms after avoiding unused parameter copies. Workload timings, not every individual call.                                                                                    |
| 7.15.0                 | [#5469](https://github.com/CourtHive/competition-factory/pull/5469): raw ID location before hydration                                                                       | Lookup hydrations: FMLC128 223 → 1, TEAM16 64 → 4, multi-event 226 → 1. Format lookups: `getMatchUpFormat` 222 → 0 (FMLC128), `getTieFormat` 64 → 4 (TEAM16) and 229 → 4 (multi-event). Action hydrations 444 → 222 / 120 → 60 / 279 → 54. |
| 7.15.0                 | [#5471](https://github.com/CourtHive/competition-factory/pull/5471): bare engine import                                                                                     | 27.1 → 15.7 KB gzip (42.1% smaller); bundled modules 124 → 69. Not the full application bundle.                                                                                                                                            |
| 7.15.0                 | [#5482](https://github.com/CourtHive/competition-factory/pull/5482): FIC128 invocation indexes                                                                              | `addGoesTo` 11.6 → 1.7 ms (6.8×); dependencies 21 → 1 ms (21×).                                                                                                                                                                            |
| After 7.15, unreleased | [#5503](https://github.com/CourtHive/competition-factory/pull/5503): venue reuse                                                                                            | Earlier profile built venue data 511 times / performed 8,176 court operations; now shared per invocation. Roughly 2× prototype timing is not a final production result.                                                                    |
| After 7.15, unreleased | [#5505](https://github.com/CourtHive/competition-factory/pull/5505): format/tally memoization                                                                               | FMLC128 432 → 38.5 ms (11.2×); COMPASS64 176 → 23 ms (7.7×); SE32 46 → 4.9 ms (9.4×).                                                                                                                                                      |
| After 7.15, unreleased | [#5506](https://github.com/CourtHive/competition-factory/pull/5506): shared draw context                                                                                    | COMPASS context built once instead of eight times. Prototype 333 → 69 ms is not an isolated final-release timing.                                                                                                                          |
| After 7.15, unreleased | [#5507](https://github.com/CourtHive/competition-factory/pull/5507): DOUBLES64 with 2,048 unrelated pairs                                                                   | Lookup 485 → 56 ms (8.7×); complete measured read 548 → 168 ms (3.3×).                                                                                                                                                                     |
| After 7.15, unreleased | [#5522](https://github.com/CourtHive/competition-factory/pull/5522): SE512 tally and then-current read                                                                      | Tally 546 → 6.9 ms (79×), calls 1,033 → 58; public read 413 → 72 ms (5.7×). Other reads: FMLC 45 → 21, COMPASS 24 → 14, SE64 13 → 6 ms.                                                                                                    |

## Elimination projection changed after the tally benchmark

[#5525](https://github.com/CourtHive/competition-factory/pull/5525) removed elimination tallying from
public projections. Thus #5522's 72 ms public read is historical, not a current-head benchmark. Its
standalone tally optimization remains useful, but does not explain a projection that skips tallying.
RR refresh also became group-scoped and policy-aware. See the
[results contract](../governors/query-governor.md#participant-results-and-refresh).
Do not multiply gains or infer a new time without measuring the final candidate.

## Choosing the work a consumer needs

- Use a matchUp ID filter for a targeted read; full structural facts still support completion,
  progression and TEAM-parent context.
- Use `hydrateParticipants: false` when entry metadata suffices. Thin output retains scoring/context
  facts; it is not raw-state access.
- Omit recovery calculations when unused. `contextProfile.exclude` redacts final output; it does not
  promise that all computation associated with the excluded attributes is skipped.
- Use `structuresProfile: 'STUBS'` where supported for a smaller response. Structure/group dependencies
  can still require full computation.
- Prefer named governor imports over the aggregate `governors` object. See
  [bundle measurements](../engines/custom-engines.md#bundle-size).

These caches/indexes belong to one invocation/traversal, not a durable cache across mutations. Do not
retain them across writes without owning invalidation. Narrow rollback snapshots require a proven
mutation footprint and complete restore evidence before optimization.

## Reproducing and extending the evidence

Build with `pnpm build`. `pnpm verify:consumer-bundle` checks bare-engine, named-query, aggregate-query and full-engine fixtures using
esbuild bundle/minify/tree shaking, ESM output and gzip level 9.
`scripts/verify/baseline/consumer-bundle.json` budgets raw/gzip growth. A budget is not a fresh timing
benchmark. Compare releases using identical fixture bodies and imports.

For timing, pin code, Node and dependency revisions; reuse identical fixtures and histories across
versions and record their hashes. Warm up, take enough repetitions for median/p95, control competing
load and verify result parity. Separate initialization, operation, serialization and consumer render.
Record hydrations/parses/traversals, output bytes and allocations with elapsed time. Counts measure
work, bytes measure payload and milliseconds measure latency; none substitutes for the others.

A useful panel is 7.0/7.5/7.10/7.15/next candidate over SE32/128/512, FMLC128, COMPASS64, TEAM16, RR64,
multi-event and unrelated-participant-heavy fixtures. Include scheduled/unscheduled and one-ID reads,
refresh on/off, line outcomes and rollback-enabled queues. Report regressions as well as gains.
Historical timings exclude network, storage and browser rendering. Gains overlap and cannot be added
or multiplied; no end-to-end speedup for the whole 7.x cycle has been established.
