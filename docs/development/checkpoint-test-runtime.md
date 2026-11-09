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

## Follow-up: matrix partitions and duration drift

The next isolated branch, `perf/checkpoint-matrix-runtime`, retains the verified `81af92fb65`
source as its prerequisite. It partitions the expensive primary TEAM line double-elimination
and compass matrices by exit status (five files each), and the main exit matrix by draw type
(ten files). The original filenames keep their composition controls. The main matrix retains
its independent historical cell composition; it does not switch to the census helper's copy.

Both matrix tiers are selected **before** partitioning. Registration comparison against `81af`
confirms all 725 full / 245 PR registrations, callback bodies, explicit cell seeds, effective
`Math.random` identities and samples, timeouts and project membership are identical. The
quarantine assertions remain in every partition, and the existing global orphan-key controls
remain. A real PR-mode seed probe found 172 mismatches that the registration-only comparator
missed: cached helpers held an earlier setup-file seed registry. Each test entry now registers
its own alias directly, rather than delegating registration to a cached shared helper. Runtime
seed observations in both isolation modes are required alongside the source comparison. No matrix cell or independent property assertion is removed. The maintained suite now
has 2,236 files; the frozen C26 and nineteen-file TEAM arm selection are unchanged.

Initial partition weights allocate the prior CI reports' per-case durations to the new files,
scaled to their original file spans, then take the same per-tier medians. These are **derived
estimates**, pending post-split CI observations; no local timings enter them. All other file
weights retain the existing calibration. Both four-shard assignments remain deterministic,
disjoint and exhaustive. The largest full estimate falls from 851.6 seconds to the remaining
FMLC line matrix's 338.1 seconds; this is a smaller scheduling unit, not a measured CI speedup.

The maintained Mentat `outcome-v2-runner.py` pins these matrices by exact filename/count.
Its companion `perf/matrix-runtime-validator` branch must accompany this change: it accepts
either the original C26 layout or the complete new layout, with exact per-file counts, unchanged
family totals (601 / 62 / 62), and no duplicate case names across partitions. Missing, unknown,
reallocated, duplicated and skipped partitions/cases are rejected. The original frozen snapshot,
nine stages, eleven invocations, root mutation selection and special nineteen-file TEAM arm
contract remain unchanged. The runner baseline passes 55 tests; the candidate passes 58,
including failure injection for the new layouts.

Local validation after the seed-registry correction: 379 PR tests pass, all 245 moved PR seed
identities match; four full differential shards pass all 725 moved tests with exact observed
seeds, and their native reports merge successfully. Focused shard times are 71.03 / 73.12 /
74.92 / 72.18 seconds with two workers; the broader 27-file differential check passes 1,099
tests. These local timings do not predict full checkpoint CI. Lint, types/compiler ratchets,
generated/layer checks, build, Markdown and the timing tool's falsification tests pass.

### Informational reporting

Coverage shards now emit a small timing artifact alongside their unchanged native blobs.
After the threshold-bearing four-blob merge, `shardTiming.mjs` checks four distinct timing
reports against the complete source inventory and writes a job summary plus a downloadable
`coverage-duration-observations-node26` artifact. It reports actual versus estimated work,
unweighted files, the largest suites and files exceeding twice their estimate (at least five
seconds). New observation steps are informational; test, coverage and required-check failures
retain their existing behavior. Reporter failures produce an explicit warning.

Each artifact records the CI run/attempt/commit, tier, pipeline, Node and Vitest versions,
runner image, CPU model/count, available parallelism, memory, requested and resolved worker
counts, observed concurrency IDs, file isolation, case fingerprints and file durations.
Durations use Vitest's module diagnostic consistently; they are not silently mixed with the
older JSON-span measurements. Image revisions and CPU models remain available to explain
variation, even within the same worker-policy cohort.

### Rolling calibration

Download complete successful observation artifacts into separate run directories, then run:

```bash
node scripts/shardTiming.mjs calibrate full vitest.shardDurations.json \
  .vitest/duration-history/full-*/shard-timing.json
```

Use `pr` and PR artifacts separately. The tool takes the latest five supplied independent
verified CI runs, with at least two runs required, within one tier/pipeline/Node/tooling/worker
cohort. The newest inventory must match the current source. Each file's median uses only
observations with its current case fingerprint: a suite that grew cannot inherit a median of
its smaller incarnation. New or changed suites with only one observation are listed explicitly
in the provenance receipt. Missing, duplicate, partial, failed, local and mixed-worker evidence
is rejected before writing weights. The other tier is preserved. Review and commit the weights
and the generated per-tier provenance receipt; CI never rewrites committed weights itself.

### Controlled worker experiment

Manual dispatch adds `coverage-workers: default | 2 | 4`. Its default preserves normal behavior;
PRs and checkpoint pushes keep the existing policy. Every option retains full matrices,
differential coverage, isolation, four shards and the same threshold-bearing merge.

Run an interleaved comparison at one source commit: default / 2 / 2 / default. First confirm
that default resolves to a different worker count; if it already resolves to two, compare four
instead. Compare both repetitions' maximum shard times, total elapsed shard time, import/test
cost and environment metadata. Do not change the default based on one observation or local
performance. If the result is inconclusive, retain the existing policy. Any policy change
requires a new full differential validation at that exact commit.

### Post-split CI comparison and calibration

Four full differential measurements used the same test/tooling commit `35662029bf`, in
interleaved default / two / two / default order. Default resolved to three workers. The table
shows GitHub test-job elapsed times, including setup; these are distinct from per-file test
seconds used by the balancer.

| Run         | Workers | Shard 1 | Shard 2 | Shard 3 | Shard 4 | Maximum |
| ----------- | ------: | ------: | ------: | ------: | ------: | ------: |
| 42666285852 |       3 |   38:52 |   34:41 |   32:37 |   32:54 |   38:52 |
| 42666326065 |       2 |   27:37 |   35:51 |   37:37 |   26:59 |   37:37 |
| 42666334506 |       2 |   24:12 |   37:35 |   38:57 |   23:11 |   38:57 |
| 42666343641 |       3 |   27:37 |   34:14 |   34:58 |   23:32 |   34:58 |

All sixteen test shards pass. The median maximum is 36:55 with three workers versus 38:17
with two; the paired results disagree. Runner CPU models vary within the four-vCPU hosted
pool. Keep the existing three-worker policy; this sample does not establish a two-worker gain.
GitHub abandoned downstream coverage jobs in several runs. Downstream-only retries recovered
42666326065 and 42666343641 without repeating test shards. Run 42666334506's retry failed
before creating jobs, and GitHub refuses another retry: its test timings are usable for the
comparison, but its overall workflow is not green and it supplies no calibration evidence.
No required gate was relaxed.

Full weights now use the two successful default-worker runs above, with the new consistent
module-diagnostic measurement. Both independently verify all 2,236 files, 31,825 passing tests
and 1,560 existing skips, the exact 7,603 direction cases, all 725 primary matrix cases and 402
extension cases. Both coverage merges report 95.24% statements, 98.42% functions, 88.40%
branches and 98.18% lines. All files have two observations of their current case fingerprint;
there are no single-observation estimates. The committed full provenance receipt records both
runs and all eight runner contexts. The PR tier is calibrated separately as observations accrue.

With refreshed weights, all four full assignments contain 559 files and approximately 4,585
estimated test/import-overhead seconds each. The largest remaining estimate is the structure
inconsistency corpus (522.4 seconds), followed by the FMLC line matrix (474.0). These are
estimates of work, not predicted wall times. Final assignment changes require an ordinary PR
check; the four measurements above precede this weight refresh. Hosted-runner variance and
further matrix growth remain risks. Review drift after subsequent v2 development cycles rather
than extrapolating one faster shard into a guaranteed checkpoint duration.

### v1 retirement prerequisites

The outcome generalization plan still owes production fallback and uncaptured-clock work;
v1 is active. This runtime change removes no comparisons and does not sunset v1. Before a
migration-only suite can retire, its handover must identify an independent assertion for each
behavioral contract, run that assertion directly under v2, and show that an injected violation
is detected without consulting v1. In particular:

| Contract                   | Independent evidence to retain or establish before deleting its v1 oracle               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Successful/refused returns | Exact result fields and error codes from the specification, including refusal atomicity |
| Notices                    | Exact payload, identity, ordering and count; a duplicate or missing notice must fail    |
| Stored material and stamps | C14/C15 invariants and explicit changed/unchanged timestamps                            |
| Seating and TEAM views     | Participant provenance, lineup placement and assignment-view regressions                |
| Clock effects              | Read/write order and throwing-write prefixes, including uncaptured direct-clock calls   |

The existing transition/integrity properties, targeted regressions, fault-injection gates and
frozen C26 replay remain required. A v1/v2 match supplies compatibility evidence, not acceptance
of the intended behavior. Mixed suites must shed only the retired comparisons, retaining their
independent assertions and fixtures. Actual removal waits for the outcome team's v1 acceptance
and sunset work; it is not a runtime optimization in this branch.
