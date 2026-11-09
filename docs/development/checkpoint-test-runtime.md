# Checkpoint test runtime and calibration

Verified 2026-11-09 on `perf/checkpoint-outcome-suites`, based on factory `68d93d3694`.
Outcome ownership was cleared before editing; production outcome code is unchanged.
The 7,603-case serial file is now 15 independently shardable suites. All 51 describe
bodies, case names, deterministic seeds and duplicate-name ordinals are preserved.

## Measured CI evidence

Times below are coverage **job** durations, including setup and artifact handling, in shard
order 1 / 2 / 3 / 4. All listed new runs and their threshold-bearing merges passed.

| Run                                                                                      | Tier and pipeline                        | Shard times                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| [42540635373](https://github.com/CourtHive/competition-factory/actions/runs/42540635373) | Historical checkpoint, full/differential | 18:59 / 55:32 / 30:12 / 29:24 |
| [42605592312](https://github.com/CourtHive/competition-factory/actions/runs/42605592312) | Unsplit PR, sampled                      | 43:41 / 7:05 / 4:22 / 6:10    |
| [42632862284](https://github.com/CourtHive/competition-factory/actions/runs/42632862284) | Split PR, sampled, before calibration    | 6:14 / 6:47 / 12:19 / 11:07   |
| [42632863234](https://github.com/CourtHive/competition-factory/actions/runs/42632863234) | Split full/differential sample 1         | 41:10 / 27:34 / 18:19 / 21:03 |
| [42632872725](https://github.com/CourtHive/competition-factory/actions/runs/42632872725) | Split full/differential sample 2         | 30:11 / 37:28 / 19:02 / 26:39 |

The controlled PR comparison uses identical starting source and lockfile: `79d498bcde`
and `68d93d3694` have the same `src` tree and `pnpm-lock.yaml` hashes. The unsplit file
itself took 42:54; the largest split file in the new PR took 6:50. Maximum PR shard time
fell 71.8% before calibration. The historical checkpoint predates later engine changes,
so its comparison is context, not an isolated attribution of all savings to this split.

The initial 245.3-second full-tier weight underestimated the old file by 9.6–13.3 times.
The initial split estimates removed that indivisible bottleneck but still left substantial
imbalance in full CI. They are now replaced by **direct measurements**.

## Calibration and verification

`vitest.shardDurations.json` now uses the per-file median of both new full/differential
samples, and the new sampled PR report separately. Inputs are official Vitest JSON
merges of exactly four native blob reports, processed by `scripts/updateShardDurations.mjs`.
No local machine timings are mixed into CI weights. Both tiers cover 2,219 known files.

Before accepting either full sample, validation checks four distinct blobs, disjoint
file sets, no unhandled errors, all 15 direction suites isolated, and the original
7,603-case multiset. Full reports include outcome-pipeline coverage and matrix counts
601 / 402 / 62 for the main, extension and double-elimination line probes; sampled PRs
have 201 / 135 / 22. Missing-blob and wrong-tier negative controls are rejected.
The calibrated assignment itself is deterministic under input reordering and assigns
each of the 2,219 files exactly once across four shards, for both tiers.

| Direction suite suffix | Cases | Full median seconds | PR seconds |
| ---------------------- | ----: | ------------------: | ---------: |
| arrivals               |   272 |                33.4 |       27.8 |
| boundaries             |    32 |                10.5 |       11.3 |
| corrections            |   804 |               211.1 |      384.3 |
| heldByes               |   526 |               218.4 |      141.3 |
| material               |   632 |               254.4 |      306.2 |
| plainByes              |   193 |               204.0 |      219.6 |
| realClock              | 1,171 |               250.1 |      144.1 |
| refreshed              |   704 |               220.8 |      259.8 |
| relabels               |   698 |               262.5 |      409.6 |
| seats                  |   528 |               247.6 |      247.2 |
| subscribed             |   188 |                49.5 |       42.3 |
| teamByes               |    80 |               159.4 |      172.9 |
| original filename      | 1,171 |               329.1 |      215.3 |
| unreached              |   292 |               102.8 |      168.2 |
| views                  |   312 |               227.6 |      341.5 |

Manual workflow dispatch now exercises the checkpoint configuration on the selected
branch: full matrices and differential coverage in **both** shards and merge. The four
shards, four-blob guard, coverage thresholds, TEAM arm lists and branch protections are
unchanged. Final verification of the calibrated assignment is recorded in
[draft PR #6340](https://github.com/CourtHive/competition-factory/pull/6340); it must be green before merge.

Local full differential coverage also passes: 2,180 files / 31,825 tests passed,
39 files / 1,560 tests skipped by the existing configuration, zero failures. CI full
samples report the same totals. Local and both CI coverage summaries agree at 95.24%
statements, 98.42% functions, 88.40% branches and 98.18% lines. No floor was lowered.
The local run took 2,213 seconds with four workers; it is correctness evidence, not a CI
calibration sample.

Additional checks: all 7,603 effective seed identities and repeated-name ordinals match
the original file; the focused four-blob merge, 38 root mutation files / 1,225 tests,
five sequencer tests, final 528 seat/landing cases, lint, types/compiler ratchets,
generated/layer/attribute gates, build, formatting and Markdown lint pass.
Moving fixtures into the harness required domain annotations for 33 implicit parameters,
one equivalent `matchUpsOf` read, and sharing two identical reader expressions. Source
comparison confirms unchanged test bodies and otherwise equivalent fixture expressions;
no ratchet baseline changed.

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

## Remaining limits

- Full weights have two direct observations; PR weights have one. Runner variation is
  visible in the two full runs. Refresh from subsequent complete reports, keeping tiers
  separate, particularly when the outcome team adds substantial cases.
- File-level balancing does not remove import, instrumentation, report-generation or
  within-shard scheduling costs. The heaviest remaining full-tier estimate is the
  double-elimination line matrix at 851.6 seconds; further runtime work should measure it.
- Frozen C26 tests, configuration, helpers and `(arm,file,test,seq)` evidence remain
  immutable and replay separately. Never regenerate that baseline from the moved suites.
