# Outcome pipeline · response to the November 21 rulings

The factory base for this round is `1b0e927bf8`. Each implementation was cut directly from that revision of `origin/dev`. The accepted external study used `7963e36968`. CA accepted 7.44.0’s default switch and carried G4 forward to the 8.0 selector-removal decision. Production v3 follows the first shipped sole-mode release. [Controlling agent response](https://github.com/CourtHive/Mentat/blob/main/assessment/2026-11-21-outcome-v3-review-response.md)

## F-005 · v2 hardening

The two saved inputs have an undecided TEAM dual and a next-round matchUp whose seats already hold other draw positions. The retirement would place the named winner there. The shared row 31 preflight previously skipped all duals. It now checks the winner’s placement for this retirement path using the existing seat predicate, including its propagated-BYE exception. The permanent regression test executes the queue with rollback explicitly disabled and compares the refusal code and the entire record hash. Both fixtures passed under v1, v2 and differential. Each of the three full suites passed 33,594 tests. Differential now returns the same refusal where 7.44.0 threw. [Factory PR #6487](https://github.com/CourtHive/competition-factory/pull/6487)

## Schedule ownership

The pilot plans a supported schedule on an already-satisfied double exit. Its focused test switches off the recorder and compares the v1 result, stored record and ordered outcome notices against both v2 and differential. The start/end-time recording control retains its existing assertion. Nine harvested scenarios from the recorded-schedule and local-write tests include a scheduled double-exit directive. The 13 steps matched their stored hash and result code under v1, v2 and differential on both base and candidate. [Factory PR #6488](https://github.com/CourtHive/competition-factory/pull/6488)

All three ordinary suites passed 33,592 tests each. The full-suite v2 census counted 9,397 successful recordings on the base and 9,395 on the candidate. The only changed cell was `schedule / SINGLE_ELIMINATION / noop`, from two to zero. Test-level instrumentation identified one occurrence in each of the two harvested source tests. The overall schedule reason fell from five to three. [Full census](followup/schedule-census.json) · [call identities and three-mode replay](followup/schedule-sites.json)

## Recorder boundary and re-triage

The recorder observes a defined set of core methods. An intervening non-core mutation can alter the same live record object. The previous identity check missed that change and attributed it to the next recorded directive. The candidate compares the live hash to the previous post-step hash and opens a new scenario from the actual pre-call state when they differ. The permanent control inserts a draw between two generation calls and checks independent reader and engine replay of both scenarios. [Factory PR #6489](https://github.com/CourtHive/competition-factory/pull/6489)

Both arms re-recorded exactly the 172 source files represented among the historical 949 common drifts and then replayed every resulting scenario in all three modes. The contemporary base reproduced 927 common drifts in this cohort. The comparison below uses that paired base. Three recording-mode assertions failed in both arms (NaN, Infinity and saved-round ordering). Each arm yielded 21,432 directives. The recorder branch’s fixed manifest also passed with all 890 committed hashes. [Paired results and file counts](followup/recorder-bound.json)

| Observation                                                             |  Base | With boundary |
| ----------------------------------------------------------------------- | ----: | ------------: |
| Scenarios                                                               | 6,848 |         7,671 |
| Source test identities with common drift                                |   484 |           292 |
| Common-drift scenarios                                                  |   927 |           953 |
| Mismatching post-steps in common-drift scenarios with a returned ledger | 3,171 |         1,673 |
| Common-drift scenarios with a differing directive result                |   198 |            35 |
| Shared replay exceptions                                                |     3 |             0 |
| Initial state mismatches                                                |    15 |            21 |
| Mode disagreements                                                      |     4 |             4 |

The additional boundaries changed the denominator. Of the originally affected source test identities, 192 cleared and 292 still exhibited drift. No additional source test identity acquired shared drift. The head-to-head file went from one drifted scenario to zero, and the mocks source from 34 to zero. Both arms retained all 619 directives from those two files. The four disagreements are the F-005 inputs on branches without the engine fix. The 953 residual shared drifts include 890 whose results agree and whose replay changes state. These counts support keeping the harvest diagnostic. Investigation can now start from the new boundaries and recorded pre-call states.

## Planner-index experiment

The experiment substitutes the retained working view at the point where v2 admission normally constructs a fresh structural index. Each accepted batch updates the retained view with the reducer’s ops. The harness discards views on broad replacements, unsupported updates, non-outcome engine mutations, fallback writes and rollback. State replacement also clears the cache, including for a new record with the same tournament and draw IDs. The experiment is opt-in and adds no shipping engine code. [Factory experiment PR #6491](https://github.com/CourtHive/competition-factory/pull/6491)

**Correctness.** Focused paired singles and TEAM walks matched on planner decisions, returned results, record hashes and ordered payloads on all subscribed public topics. The walks exercised a non-outcome schedule write, a queue rollback after a successful score, and state replacement. A separate trace run used the E2 workloads, fixed time, three seeds and 99 pairs. All 9,651 accepted calls per arm matched in the per-draw ordered trace of plans, returned results, post-call record hashes and four outcome notice topics. The retained index served 9,552 reads on those workloads. No parity claim is made for concurrent async calls or direct mutation of borrowed records. [Paired digests and index counters](followup/planner-traces.json)

**End-to-end timing.** A separate run disabled tracing and timed the entire public mutation on the same E2 workloads. The host was 95.2% idle just before the first measurement. The median of its in-run idle samples was 93.4% (range 89.5–94.3%). The table shows the median of three per-draw sums, with the mean per call for that draw. Fixture creation and the queries used to find the next playable match are outside the mutation timer. [All raw samples, host readings and workload medians](followup/planner-timing.json)

| Event and workload | Positions | Calls | Fresh ms/draw | Retained ms/draw | Fresh ms/call | Retained ms/call |
| ------------------ | --------: | ----: | ------------: | ---------------: | ------------: | ---------------: |
| SINGLES score      |       128 |   127 |         200.3 |            177.7 |          1.58 |             1.40 |
| SINGLES score      |       256 |   255 |         741.1 |            662.0 |          2.91 |             2.60 |
| TEAM score         |       128 |   127 |       1,240.3 |            835.7 |          9.77 |             6.58 |
| TEAM score         |       256 |   255 |       4,997.9 |          3,282.3 |         19.60 |            12.87 |
| TEAM exit          |       256 |   255 |       4,518.1 |          2,798.5 |         17.72 |            10.97 |
| TEAM unwind        |       256 |   319 |       5,677.7 |          3,573.4 |         17.80 |            11.20 |

For comparison, the prior quiet v2 scoring baseline at 256 positions measured 713.8 ms per singles draw and 4,880.1 ms per TEAM draw. The two columns above come from the current paired experiment. The retained median was lower in 32 of 33 cells. In the 16-position singles scoring cell it rose from 12.0 to 12.6 ms per draw. Three seeds per cell establish the measured trend and are too few for a savings estimate. Recommend a larger counterbalanced timing study on representative consumer workloads before a production decision.

## Reproducing the comparisons

For F-005 and the schedule pilot, run the ordinary Vitest suite on each PR branch with the selector set explicitly.

```sh
for mode in v1 v2 differential; do
  OUTCOME_PIPELINE="$mode" TZ=UTC pnpm exec vitest run --maxWorkers=5 --reporter=dot
done
```

For the paired census, use the report branch’s `scripts/ext/outcomeCensus.config.mts` and `src/tests/testHarness/outcomeExternalCensus.ts` with the unmodified factory base and the schedule branch. The report’s replay driver (`src/tests/corpus/outcomeExternalReplay.test.ts`) replays every selected directive through all three modes. Supply a separate empty census output file for each checkout.

```sh
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_CENSUS_JSONL="$CENSUS_JSONL" pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts --maxWorkers=4 --reporter=dot
node scripts/ext/summarizeOutcomeCensus.mjs reference="$REFERENCE_JSONL" candidate="$CANDIDATE_JSONL"
```

For the recorder comparison, use the 172 distinct source files in `ext-report/harvest-drift-triage.json`. The original JSONL file’s first scenario contains the source test path in `source.ref` before `::`. Run those paths with `CORPUS_RECORD=1 TZ=UTC` on the base and recorder branch, writing each arm to a separate empty `CORPUS_OUT` directory. Replay each directory in a fresh process using the report driver.

```sh
TZ=UTC OUTCOME_EXTERNAL_CORPUS="$CORPUS_OUT" OUTCOME_EXTERNAL_CORPUS_GLOB='src-*.jsonl' OUTCOME_EXTERNAL_REPLAY_DETAILS="$LEDGER" OUTCOME_EXTERNAL_REPLAY_JSON="$REPLAY_RESULT" pnpm exec vitest run src/tests/corpus/outcomeExternalReplay.test.ts
node scripts/ext/triageHarvestDrift.mjs "$LEDGER" "$CORPUS_OUT"
node scripts/ext/summarizeReplayBound.mjs "$REFERENCE_DIR" "$REFERENCE_LEDGER" "$CANDIDATE_DIR" "$CANDIDATE_LEDGER"
```

The planner experiment’s opt-in configuration, comparison commands and timing procedure are in the [experiment PR](https://github.com/CourtHive/competition-factory/pull/6491).
