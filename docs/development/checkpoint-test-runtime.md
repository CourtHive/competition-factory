# Checkpoint test runtime, 2026-11-09

Measured on factory `68d93d3694`, on `perf/checkpoint-outcome-suites`. Outcome owner
coordinated before editing: the prior session ended after #6339, with no held paths or
running Button jobs. ATC found no competing factory writer. Production outcome code,
matrices, workflow, coverage thresholds and branch protections are unchanged.

## Diagnosis and measurements

`ownedDirectionWrites.test.ts` serializes 7,603 tests in one worker. File-level sharding
cannot subdivide it. Its 245.3-second full-tier weight was stale by 9.6–13.3 times;
refreshing that weight alone still leaves a 39–54-minute indivisible task.
The three retained full/differential coverage runs contain the same 7,603 cases:

| CI run                                                                                   | Coverage jobs, shards 1 / 2 / 3 / 4 | Direction file |
| ---------------------------------------------------------------------------------------- | ----------------------------------- | -------------- |
| [42536204205](https://github.com/CourtHive/competition-factory/actions/runs/42536204205) | 35:20 / 47:59 / 26:35 / 17:13       | 46:52          |
| [42540635373](https://github.com/CourtHive/competition-factory/actions/runs/42540635373) | 18:59 / 55:32 / 30:12 / 29:24       | 54:25          |
| [42545763712](https://github.com/CourtHive/competition-factory/actions/runs/42545763712) | 26:13 / 40:26 / 15:58 / 27:51       | 39:26          |

Each full report has 2,201 files. Weights now use the per-file median of these three
reports. Relocated suites use the median of their constituent `describe` durations,
**estimates derived from real CI**, pending direct measurement after landing.
The v1/v2 ownership expectations have since advanced on dev; the CI cases and original
local baseline still number 7,603. The frozen C26 baseline is neither edited nor regenerated.

The regression now reaches dev PRs too: [42570338976](https://github.com/CourtHive/competition-factory/actions/runs/42570338976)
(`FACTORY_MATRIX_TIER=pr`) took 47:14 / 6:48 / 8:05 / 4:37; this file took 46:18.
It has no tier sampling. The PR weights are refreshed from that complete 2,202-file
report (one observation, not a multi-run median).

## Change and expected reduction

Fifteen independently shardable suites retain all 51 `describe` bodies and all 7,603
cases. Shared fixtures/player live in `src/tests/testHarness/outcome/directionFixtures.ts`.
Each test file keeps the original v1 writer mock and teardown. Its actual `vi.mock`
keeps it isolated under both full and PR tiers. The mock and player share a per-file
counter through a dependency-free leaf module. The fixture file retains the original
test-only duplicate-string lint exemption.

| Suite suffix                                          | Cases | Full-tier estimate, seconds |
| ----------------------------------------------------- | ----: | --------------------------: |
| original filename (owned record/return/notice parity) | 1,171 |                       342.3 |
| subscribed                                            |   188 |                        67.7 |
| material                                              |   632 |                       264.8 |
| realClock                                             | 1,171 |                       234.8 |
| boundaries                                            |    32 |                        13.8 |
| arrivals                                              |   272 |                        42.8 |
| plainByes                                             |   193 |                       189.4 |
| teamByes                                              |    80 |                       227.3 |
| heldByes                                              |   526 |                       205.7 |
| unreached                                             |   292 |                       111.5 |
| relabels                                              |   698 |                       250.3 |
| refreshed                                             |   704 |                       166.3 |
| corrections                                           |   804 |                       232.7 |
| views                                                 |   312 |                       202.8 |
| seats                                                 |   528 |                       257.2 |

Replay of run 42540635373's measured file/suite durations through the unchanged LPT
assignment: shard test-work totals change from 1,846 / 6,720 / 3,595 / 3,970 seconds
to 3,906 / 4,086 / 3,938 / 4,200. Maximum work falls 37.5%; across the other two full
runs it falls 30.8–31.6%. The retained reports show three concurrency slots, but test-work
is not wall time: the original indivisible file alone imposed a 54:25 floor on its
shard. Its largest replacement measured 6:33 in that run. These are scheduling projections,
**not candidate CI timings**. Host contention, instrumentation, test ordering and
repeated fixture imports can change wall time.

## Behavioral evidence and retirement

No combinations are deleted here. Side mirrors, walkover/default/retirement, policy
on/off, populated/unreached seats, clear/correction, TEAM line/dual and subscription
modes cross different behavioral boundaries. A fixed-clock comparison and a real-clock
comparison detect different faults. There are 93 repeated rendered names, often from
truncated parameter labels; repeated names do not establish redundant inputs. A canonical
input audit of all 54 exported `[label, scenario]` tables found no repeated inputs within
a table (including 1,171 distinct `SCENARIOS` inputs). This does not prove every Cartesian
combination is necessary; larger tuples and reuse across different assertion contracts
need separate review before pruning. Duplicate and distinct synthetic input controls
validate the audit.

- **Retire with v1:** the old-writer counter, zero-v1-call ownership assertions, v1/v2
  record/return/notice comparisons and fallback ownership controls. Remove them only
  with the v1 sunset and the outcome team's acceptance gates, not as a timing shortcut.
- **Keep independently:** C14 stored-material invariants and changed/unchanged stamps;
  C15 explicit relay material; subscriber identity/order/count assertions; TEAM lineups
  and assignment views; explicit successful/refused return contracts and census pins.
  These are interleaved with migration comparisons in several suites: retain those
  assertions and fixtures when removing the v1 oracle, rather than deleting whole files.
- **Before retiring the oracle-only cases:** pin their intended results directly from
  the outcome specification, including refusal atomicity, seating/provenance and clock
  effect order/throw prefixes. Equality with v1 proves compatibility, not correctness;
  common predicate defects can pass both implementations. The separate invariant,
  regression and fault-injection suites remain intact.

Use `pnpm exec vitest run ownedDirectionWrites` to select the whole family. Selecting
only the original exact filename now selects its 1,171-case ownership suite. Maintained
runner scripts discover these suites by directory; historical exact-file evidence and
the frozen `(arm,file,test,seq)` corpus stay unchanged. The 38 root mutation allow-list
files, all nine outcome runner stages and TEAM arm lists are unchanged.

## Verification and remaining work

Baseline: 7,603/7,603 full-tier differential tests pass, 639.923 seconds on one worker;
repository lint and type checks pass. A TypeScript source comparison confirms unchanged
51 describe bodies. Across 153 original fixture statements it permits only export/type
annotations, two identical matchUp readers shared without changing their expression, and
one equivalent structural read through the existing `matchUpsOf` accessor. Moving fixtures
out of a `.test.ts` exposed 33 implicit parameters and one hard-union read: existing domain
types, the shared reader and that accessor satisfy the stricter checks. No ratchet baseline
changed. Runtime collection matches the original case-name multiset, including
duplicate occurrences, and all 15 files are isolated. The source comparator is falsified
with a changed assertion.

The four focused full-tier differential runs (no coverage, two workers each, executed
serially) passed in 103.916 / 99.260 / 114.560 / 123.061 seconds. They ran 2,261 / 1,604 /
1,557 / 2,181 tests in 4 / 4 / 4 / 3 files. Vitest merged exactly four blob reports into
15 files / 7,603 passing tests; the original case-name multiset is exact. All 7,603
observed effective RNG identities, seeds and duplicate-name ordinals match the baseline.
The 93 repeated-name occurrences are preserved, and a changed-seed control is rejected.
The slowest focused shard is 2:03 versus the original indivisible file's 10:40 locally;
this is not a full-suite or coverage benchmark.

The 38 root mutation files (1,225 tests) and five duration-sequencer tests pass. Repository
lint, type checking, generated gates, attribute audit, build, formatting, import ordering
and report Markdown lint pass. The input-table inspection is a separate diagnostic probe.
No production fault-injection test, outcome stage, root gate or matrix case is removed.
The affected 528-case seat/landing suite passes again after the compiler-driven fixture changes.

After an authorized push, run the actual checkpoint coverage gate, inspect all four
job times and the threshold-bearing merge, then refresh estimates with
`scripts/updateShardDurations.mjs` from the new whole-suite JSON reports. New suite
weights must become direct measurements. PR-tier weights need more observations.
Keep frozen C26 replay independent of maintained-suite file moves.
