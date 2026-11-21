# Outcome pipeline adjudication

For the controlling agent, start with the [v3 review handoff](V3_REVIEW.md).

## 1. Summary

- **VERIFIED** Clean `dev` at `7963e36968` passed 33,517 tests each under v1, v2 and differential.
- **VERIFIED** The public fixed sources replayed 2,855 tournament scenarios and 67,918 steps with identical result codes
  and state hashes in all three modes. Dedicated grammar and scoring replayers passed in all modes.
- **VERIFIED** `corpus:verify` stopped at 68 suite-harvest failures. The clean suite passed. The deterministic sources ran separately.
  The official coverage reader also throws on a 1.08 GB JSONL file.
- **VERIFIED** Two TEAM presets reached a shared `STALLED_POSITION` report on generated odd fields. The four-position
  controls passed. Whether to change the audit or setup needs a ruling.
- **VERIFIED** The suite census counted 9,397 successful recordings. Exit, cascade and TEAM account for 77%.
- **VERIFIED** Two harvested TEAM inputs expose one shared-writer atomicity defect in released 7.44.0.
- **VERIFIED** A schedule-only prototype exposed a notice assumption and then an existing ownership assertion.
- **VERIFIED** E1 found no extra writes on the measured calls. In the quiet v2 E2 run, scored TEAM draws took 9.08 ms/call at 128 positions and 19.14 ms/call at 256 (127 and 255 calls).

## 2. Baseline

**VERIFIED** Release tag `v7.44.0` (`98a7200e48`) contains the baseline. The outcome pipeline, matchUpStatus implementation and held-seat predicate have no diff from baseline to inspected `origin/dev` at `1b0e927bf8`. In 7.44.0 v2 became the default. V1 remains selectable in 7.x. Production v3 follows the first shipped sole-mode release, scheduled for 8.0 when the selector is removed.

**VERIFIED** `7963e369686f0c13cc18b57cfd8f09da918351ac`, Node 26.8.1, UTC, six workers.

| Pipeline     | Files passed | Files skipped | Tests passed | Tests skipped |
| ------------ | -----------: | ------------: | -----------: | ------------: |
| v1           |        2,283 |            41 |       33,517 |         1,562 |
| v2           |        2,283 |            41 |       33,517 |         1,562 |
| differential |        2,283 |            41 |       33,517 |         1,562 |

**VERIFIED** The report branch's normal differential run passed 33,513 tests with 1,624 skipped. The opt-in
exploration tests are among the skips. The report worktree uses the same locked dependencies as the baseline.

**VERIFIED** TEAM arms passed 1,528 per mode. Route differential, double-exit sweep, deep corrections, and hydration
gates passed. The route and deep-correction package scripts hard-code v2. The underlying commands were also run
with differential. Deep corrections reported 1,596 identical, four incomparable, zero refused and zero severe in
both modes. Spec consistency, any count, layers, check-types and lint all passed on the clean baseline.

**VERIFIED** `corpus:verify` produced 16 fixture scenarios and 2,727 oracle scenarios (66,771 oracle steps), then
`corpus:record` returned 68 failed, 33,444 passed and 1,567 skipped. The recording suite runs with a synthetic ticking
clock as described in `corpus/README.md`. Several failures concern time or unusual input serialization. The 58
ranking-related failures span four test files and need separate triage before assigning a common cause.

**VERIFIED** Three-mode public tournament replay. Result comparisons use the writer's normalized success or
error code and the mismatch oracle's step hash. The accepted v1/v2 refusal-context difference is outside that code
comparison.

| Source                 | Scenarios |  Steps | Mode disagreements | Shared drift |
| ---------------------- | --------: | -----: | -----------------: | -----------: |
| Authored, with new pin |        17 |     87 |                  0 |            0 |
| Fixtures               |        16 |     22 |                  0 |            0 |
| Mocks                  |        30 |    452 |                  0 |            0 |
| Queue                  |         5 |      7 |                  0 |            0 |
| Scheduling             |        60 |    579 |                  0 |            0 |
| Oracles                |     2,727 | 66,771 |                  0 |            0 |

**VERIFIED** The dedicated grammar and scoring tests gave 377 passing cases per mode. The streaming replay
completed all 41,829 harvested scenarios and 181,471 steps. It found four mode disagreements, representing two
duplicated one-call inputs (F-005), and 949 scenarios with drift shared across all modes. Shared drift is relative
to the harvested expectation. The replay ledger provides exact scenario IDs for the mode differences and examples
of shared drift. The official coverage reader independently fails on the 1.08 GB JSONL file because it reads each
complete file as one string. The deterministic-source coverage comparison below is independent of that exception.

### Harvest drift triage

**VERIFIED.** Joined all 949 common-drift ledger rows (2.27% of 41,829 scenarios) to their original directives and recorded results across 172 source files. Classify once per scenario in the order shown. A normalized directive result is success or the error code. For a step omitted from the mismatch ledger, both its result and state hash matched the stored expectation. [Classification script](../scripts/ext/triageHarvestDrift.mjs) · [per-scenario classifications](harvest-drift-triage.json)

| First applicable observation                                  | Scenarios | Interpretation                                                                                                                                            |
| ------------------------------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay threw                                                  |         3 | All three are scheduling-conflict cases and throw while reading `matchUpIds` from an undefined value. Investigate replay setup and scheduling separately. |
| Initial hash differs                                          |        15 | The loaded state diverges before the first directive. Check normalization and state restoration first.                                                    |
| A directive result differs                                    |       202 | At least one success or error code differs from the recorded result. Inspect missing prerequisites before attributing a case to the engine.               |
| Results agree and replay stays at the initial hash throughout |        31 | At least one recorded step expects a state change.                                                                                                        |
| Results agree and replay changes state                        |       698 | At least one post-step hash differs. `setMatchUpStatus` is the first mismatching directive in 234. Compare field-level deltas and captured context.       |

**Two cases traced.** The head-to-head test generates draws, completes them and calls `addDrawDefinition`. Its harvested scenario contains nine `generateDrawDefinition` directives. The first hash matches, then eight patches add draws while the replay hash stays at its initial value. The missing additions explain this drift. In the mocks-source scenario ending in `part-2`, the initial event has no draw. Two `addEventEntries` directives precede a `setMatchUpStatus` whose recorded patch introduces a whole draw. Replay returns `ERR_NOT_FOUND_DRAWDEF`. Neither directive prefix constructs the state required by the recorded expectation. [Head-to-head source](../src/analyze/report/tests/headtohead.test.ts) · [harvest recorder](../src/tests/testHarness/corpus/recorder.ts)

**Assessment.** The classifications describe symptoms. The two incomplete captures establish a harness problem for those examples. Root causes for the other 947 remain open. Resolve or explicitly account for shared drift before using the harvest as a release gate. Differential exposes mode disagreements. The unchanged-record invariant independently diagnoses F-005 even when both standalone modes produce the same incorrect state.

## 3. Findings

| ID    | Class      | Title                                                                   | Severity                        | Repro                                                                          | Spec                    | Verified          |
| ----- | ---------- | ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ | ----------------------- | ----------------- |
| F-001 | G, harness | Recording changes the observed ad hoc stamp                             | Medium for corpus qualification | `src/tests/mutations/outcome/ownedDirectionWrites.graph.test.ts`               | § 4, § 8                | Yes               |
| F-002 | G          | Odd TEAM fields can end a generated walk with a stalled downstream seat | Low pending adjudication        | `src/tests/mutations/exitPropagation/outcomeExternalTeamStall.test.ts`         | §§ 5–6, TEAM completion | Yes, audit result |
| F-003 | G          | Bare winner re-entry retains a blank score                              | Low                             | `src/tests/mutations/exitPropagation/outcomeExternalLaws.test.ts`              | §§ 3–4                  | Yes               |
| F-004 | T, harness | Harvested corpus exceeds coverage reader string limit                   | Medium for corpus qualification | `src/tests/corpus/coverage.test.ts`                                            | § 8, corpus README      | Yes               |
| F-005 | P, D       | TEAM retirement writes before a held-seat refusal                       | Moderate for direct callers     | `src/tests/mutations/exitPropagation/outcomeExternalDifferentialRepro.test.ts` | row 31, § 6             | Yes               |

## 4. Corpus extension

**VERIFIED** Added `authored/outcome-adversarial/missing-edges-after-refusal`. Row 23 refuses a numeric notes value.
The stored draw remains edge-free on refusal. The next accepted scored result stores the winner edge and its valid
notes. The writer and the authored test accepted the new scenario in every mode. The source and manifest are separate
commits, `ce88febd2b` and `9273156c2a`. The manifest diff adds one line and changes zero existing hashes.

| Coverage on the same deterministic source population |   Before |    After |
| ---------------------------------------------------- | -------: | -------: |
| Scenarios                                            |      890 |      891 |
| Steps                                                |   21,935 |   21,937 |
| Core methods exercised                               | 19 / 183 | 19 / 183 |
| Declared errors observed                             |  4 / 609 |  4 / 609 |

**VERIFIED** The seeded property sweep reused the matrix driver to exercise mutation atomicity, structural
invariants and the final draw audit. It ran 52 cells per mode across 17 draw types and all 19 tie-format
presets, with seven or five entrants in an eight-position field and a compatible density for LUCKY_DRAW.
Each mode passed 50 and hit the same two TEAM audit failures. This sweep used WALKOVER, DEFAULTED, RETIRED and
DOUBLE_WALKOVER plus ordinary bare wins. It did not attempt every status or the full requested property cross product. The separate laws probe passed replay determinism and independent-branch
commutativity on a seeded singles draw in all three modes. It also exercised five statuses with notes and schedule
in NATIVE, BRIDGE and LEGACY on a linked qualifying draw. The bare-winner clear/re-entry probe produced F-003.

## 5. v3

### Whole-call census

**VERIFIED** `census.json` contains the raw cross-tabulation by reason, draw type and route. The instrumentation is
in Vitest's transform and test harness. It tags a successful recording with the reason that existed before the
recording and counts it only when v2 returns the recorded result. A successful plan physically recorded because it
left more work is labeled `settle`, or `clock` when the uncaptured-clock phase certification failed. Explicit mode
switches within the suite are honored. The instrumented config ran 33,513 passing and 1,563 skipped tests. The clean
run had four more passing tests. Counts are call occurrences, so the suite and corpus populations may overlap. The v2 replay counted 17,188 whole-call recordings in harvested scenarios and 2,744 across the deterministic tournament sources.

| Reason       | v2 suite recordings | Candidate legacy writer seam                                      | Native plan and risk                                                                                                                                                             | Spec                     | Estimate              |
| ------------ | ------------------: | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| exit         |               3,972 | `progressExitStatus`, `doubleExitAdvancement`                     | Emit origin, reservation, carry and convergence ops against the current projected seats. High risk at policy boundaries and onward causal chains.                                | §§ 3–5, exit propagation | 3–5 weeks             |
| cascade      |               2,314 | `directParticipants`, `settleForwardConsequences`                 | Walk affected BYEs and played landings. Reuse placement, advance, release and result ops with explicit landing preconditions. High risk for deep multistructure corrections.     | §§ 4–5                   | 2–4 weeks             |
| team         |                 968 | `handleTeamAutoCalc`, `updateTieMatchUpScore`, `updateSideLineUp` | Plan line and dual together. Update lineup, tally and order with existing ops. Preserve own-call winner and row 14 admission. High risk at feeding and tally relabel.            | §§ 2, 3, 7.2             | 3–5 weeks             |
| route        |                 560 | `setMatchUpState` dispatch                                        | Split the bucket by route, certify each dispatch, then use schedule/status/result/direction ops. High risk until distinct call populations are measured.                         | §§ 3–4                   | 1–3 weeks             |
| loser        |                 463 | `directLoser`, `removeDirectedLoser`                              | Seat the loser or reserve the vacancy by link eligibility, releasing downstream placements when eligibility changes. High risk at the held-seat boundary.                        | row 12, row 31, §§ 4–5   | 2–3 weeks             |
| settle       |                 397 | `settleAfterWrite` and reconciliation passes                      | Emit corrective ops against op deltas plus reachable effects. High risk of v1 order differences. Ruling required for changed repair timing.                                      | § 5.1, § 6               | 3–5 weeks             |
| link         |                 184 | `directWinner`, `reconcileLinkAdvancements`                       | Resolve link targets by round/finishing position, then emit assignment and dependent arrival ops. High risk for qualifying and playoff links.                                    | §§ 3–5                   | 1–2 weeks             |
| status-codes |                 156 | `modifyMatchUpScore`, `deriveStatusCodes`                         | Faithful phase uses the existing code op. In 8.x remove positional input/output per ruling and derive the supported facts from provenance. Medium migration risk.                | §§ 1, 4, 7.2             | 3–5 days              |
| edges        |                 143 | `holdGoesTo`, `ensureGoesTo`, `announceGoesTo`                    | Compute edges in the view. Emit a structural-edge op only on acceptance and preserve draw notice order. Medium risk for partial legacy topologies. Ruling for pre-normalization. | §§ 3.1, 6, 7.2           | 4–7 days              |
| write-mode   |                 128 | `setFirstClassOrExtension`, `applyScoredTime`                     | Preserve timeItem and bridge layout with explicit storage ops during compatibility. Ruling needed for changing accepted storage modes. High migration risk.                      | §§ 4, 7                  | 1–2 weeks             |
| clock        |                  38 | temporal stamps, deferred notices                                 | Extend temporal phase certification for ordered clocks, thrown clock callbacks and exact stamp scope. Medium/high compatibility risk. Ruling if observable clock reads change.   | §§ 4–6, 7.2              | 1–2 weeks             |
| competition  |                  19 | `processCompetitionMatchUp`                                       | Compute ratings on the projected result and emit an explicit draw competition-state op plus the existing draw notice. Medium risk for update order.                              | §§ 4–5, 7.2              | 4–7 days              |
| winner       |                  15 | `removeDirectedParticipants`, `removeSubsequentRoundsParticipant` | Withdraw the winner and re-enter affected seats with existing clear and release ops. High risk around played downstream and row 14.                                              | §§ 2, 3–5                | 1–2 weeks             |
| tallied      |                  14 | participant/group tally                                           | Compute the group tally from the post-result view and emit `setParticipantResults`. Preserve ordering and notice identities. Medium cross-structure risk.                        | §§ 4–5, 7.2              | 4–7 days              |
| notes        |                  13 | `modifyMatchUpScore`, `addNotes`                                  | Attach notes to each result op where v1 forwards them. Preserve reference semantics on the supported fixture object until ruled otherwise. Medium risk for branched writes.      | row 23, §§ 4, 7.2        | 3–6 days              |
| provenance   |                   8 | `reconcileProvenanceSides`, origin/relay cleanup                  | Emit origin changes and causal relay removals alongside placements. High risk with side swaps and legacy records. Ruling needed for seat-keyed migration.                        | §§ 4–5, exit propagation | 1–2 weeks             |
| schedule     |                   5 | `scheduleRefusal`, `addMatchUpScheduleItems`                      | Plan schedule-only mutations with no implied outcome notice. Add exact time-item ops for start/end/officials and certify TEAM lines. Medium risk at writer envelopes.            | § 2, § 3.5.8, § 7.2      | 3–6 days              |
| no-record    |                   0 | direct low-level v1 entry                                         | Keep an explicit direct-call effect scope or define a separate supported low-level API. Ruling required if removing acceptance.                                                  | § 7.2                    | 2–5 days after ruling |

**VERIFIED** `writer-reach.json` lists files and executed functions from precise coverage around accepted copy
writes in 15 focused recording test files and two direction-write files. The instrument takes the first accepted copy for each reason per test
file. Counts are lower bounds. The test sample and 20 FMLC oracle cases covered all 17 observed reasons. No successful
`no-record` recording appeared. See the reproduction commands.

**BELIEVED** The writer seams and effort estimates above are source-reading hypotheses. The top two buckets are
roughly two thirds of the counted suite recordings and merit design first. Competition or edges is a second pilot
candidate if existing ownership assertions can be adjudicated.

### Schedule prototype

**VERIFIED** `ext/v3-schedule` plans a supported schedule on an already-satisfied double exit using
`setMatchUpSchedule`. The first attempt falsely predicted `updateInContextMatchUp` in differential. Suppressing that
prediction for a schedule-only plan cleared the notice divergence. Focused differential then passed 23 of 24 tests.
The remaining assertion in `recordedScheduleCall.test.ts` requires `{ abstained: 2, applied: 1 }`. The prototype
produces `{ abstained: 1, applied: 2 }`. This is an explicit ownership assertion. Qualification requires CA to
resolve it. Existing tests were left intact. Whole-suite v2 and differential each finished with that one failure
and 33,512 passing tests. The instrumented before/after census moved exactly two SINGLE_ELIMINATION `noop` calls from
`schedule`, reducing that bucket from five to three. Every other reason, draw type and route count was unchanged.
The public manifest check passed all 890 entries at the prototype's clean base. A full step-by-step harvested replay
did not qualify the prototype.

### E1–E4

**VERIFIED E1.** In the 16 original authored cases, v1 with fresh settlement inputs after each accepted call
ran 74 extra settlement passes for 74 calls. Zero record changes, cycles, cap hits, errors or increases in buffered
notice count. All 85 step hashes matched. The 2,727 oracle scenarios contributed
63,433 further calls and extra sweeps, with zero record changes, cycles, cap hits, errors or notice-count increases.
All 66,771 step hashes matched. The notice counter observes length, so it cannot establish whether a same-key
notice was replaced. The experiment caps extra sweeps at eight and records repeat hashes separately from cap hits.

**VERIFIED E2.** Original E2 run, median milliseconds summed across every mutation in one completed draw, over three seeds. The run command selected v2. The original JSON did not capture effective mode. Samples include traversal time
separately. Scores use side 1, exits use a WALKOVER every fourth result, and unwind immediately corrects that exit to
a score with change propagation enabled. TEAM measures dual-level calls on generated COLLEGE_DEFAULT draws.
Other test activity overlapped this benchmark, so use the curve as a first measurement.

| Event   | Positions | Score (ms/draw) | Exit (ms/draw) | Unwind (ms/draw) |
| ------- | --------: | --------------: | -------------: | ---------------: |
| SINGLES |        16 |            12.2 |            9.0 |             10.4 |
| SINGLES |        32 |            23.7 |           21.1 |             25.8 |
| SINGLES |        64 |            68.5 |           53.8 |             69.3 |
| SINGLES |       128 |           200.6 |          196.6 |            236.0 |
| SINGLES |       256 |           781.3 |          682.3 |            897.3 |
| TEAM    |         8 |             8.6 |            7.0 |              9.2 |
| TEAM    |        16 |            25.2 |           21.8 |             27.5 |
| TEAM    |        32 |            81.1 |           72.5 |             98.3 |
| TEAM    |        64 |           299.0 |          269.2 |            347.9 |
| TEAM    |       128 |          1310.8 |         1202.0 |           1535.6 |
| TEAM    |       256 |          5518.5 |         4914.1 |           6171.8 |

The original scored draws used 127 calls at 128 positions and 255 at 256. Dividing each draw’s summed mutation time by its call count gives 1.58 → 3.06 ms/call for singles and 10.32 → 21.64 ms/call for TEAM. These are mean call times within the median draw. Individual call latency varies. Exit has the same call count as score. Unwind adds a correction after every fourth match. The measured upper sizes are consistent with roughly linear growth in average work per call and quadratic growth over a whole draw.

**VERIFIED E2 rerun.** The same score, exit and unwind workloads ran sequentially in two one-worker commands. All 99 samples store the effective pipeline read from the engine (`v2`). On the 28-core host, aggregate CPU was 95.9% idle immediately before the run and 87.1–96.0% idle during the monitored intervals. No other benchmark or suite was started during timing. The table shows scored draws. The total is the median of three per-draw sums of mutation time. The per-call figure divides that total by the calls in each draw. Fixture construction and traversal overhead are excluded. [Standard sizes](e2-quiet-standard.json) · [large TEAM sizes](e2-quiet-large-team.json) · [host observations](e2-quiet-host.json)

| Event   | Positions | Calls per draw | Whole draw, ms | Mean ms/call |
| ------- | --------: | -------------: | -------------: | -----------: |
| Singles |       128 |            127 |          186.8 |         1.47 |
| Singles |       256 |            255 |          713.8 |         2.80 |
| TEAM    |       128 |            127 |        1,153.7 |         9.08 |
| TEAM    |       256 |            255 |        4,880.1 |        19.14 |

**VERIFIED E3.** An opt-in reducer hook retained a separate working view across accepted v2 batches. It applied the
same ops before comparing result, score, positions, occupants, edges and line identities with a fresh index. Across
9,651 batches and 9,265,521 fresh-index entries there were no mismatches, errors or whole-view invalidations. The
projection does not compare every index field or stamp. The engine still planned with its ordinary index.

| Event / positions | Workload | Incremental ms | Fresh ms |
| ----------------- | -------- | -------------: | -------: |
| SINGLES / 16      | score    |            1.6 |      1.1 |
| SINGLES / 64      | score    |            6.1 |     11.5 |
| SINGLES / 128     | score    |           17.7 |     41.4 |
| SINGLES / 256     | score    |           63.5 |    167.3 |
| SINGLES / 256     | unwind   |           82.1 |    217.5 |
| TEAM / 64         | score    |           24.2 |    129.5 |
| TEAM / 64         | unwind   |           30.1 |    158.0 |
| TEAM / 128        | score    |           75.0 |    471.6 |
| TEAM / 256        | score    |          298.5 |   2126.4 |
| TEAM / 256        | unwind   |          344.9 |   2571.9 |

**BELIEVED** Key the index by tournament-record instance and share the overlay's invalidation rule. State replacement,
non-outcome writers, rollback and broad record replacement need explicit invalidation. The current overlay still
walks whole structure profiles. These measurements indicate lower rebuild cost and do not establish a linear
completion curve or an end-to-end savings.

**VERIFIED E4 baseline.** On the public `teamMadness.codes.json` fixture, 30 repetitions per mode of a same-winner
line-score correction, excluding a warm-up per mode and record reloading, were 12.60 ms median in v1 and 2.54 ms in
v2. The empirical 95th-percentile order statistic (29th sample) was 14.88 and 4.09 ms respectively. The public fixture is one archived record, and the estimate is specific to this correction. A separate index run
alternated scores on the same resident draw. It compared 744 fresh-index entries over 31 v2 batches with zero
mismatches, 5.0 ms of incremental maintenance and 9.4 ms of fresh rebuilds.

### Spec delta and landing order

**BELIEVED** Grow v3 in TypeScript inside `outcome/`, keeping the reducer, view oracle and v2 harness. First certify
the bounded planner pilots and capture writer coverage by abstention reason. Then address the large shared exit,
cascade and TEAM families. Run fixed-point and planner-index experiments now. Production adoption and record migration follow the first sole-mode release, scheduled for 8.0. Delete the recorder only after complete reachability, parity on unchanged contract fields, zero
unexplained fallback and CA-approved deltas. Keep an executable snapshot of the retired path as a test oracle during
qualification.

| Question for CA                                               | Current rule                                                                                                                                     | Options and recommendation                                                                                                                               | Consumer-visible effect and corpus proof                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should settlement follow a fixed point over affected changes? | § 5 orders whole-draw passes. § 5.1 describes dependencies.                                                                                      | A. Keep the order and scopes. B. Schedule an observational fixed-point arm now and adopt delta scheduling only after broad verification. Recommend B.    | Compare every step and ordered notice. A repair moving to migration or earlier in a call can affect `updatedAt`, notices, warnings and final hashes.                                                       |
| Is the notice contract open in 8.x?                           | §§ 4–6 and 7.2 preserve v1 emission boundaries and stamps.                                                                                       | A. Freeze payloads and timestamp edges. B. Permit explicit, versioned changes with consumer acceptance. Recommend B as a ruling boundary.                | Publish before/after payload and result examples and test client merging, scheduling refresh and server publication. Preserve state hashes when only emission changes and pin notice traces independently. |
| Should 8.x normalize represented exits and edges?             | § 7 stores legacy/bridge outcomes. §§ 4–5 and exit propagation rely on side and positional representations. § 7.2 accepts edges missing on load. | A. Continue repair on a write. B. Versioned normalization and stable seat-keyed provenance. Recommend B only after ambiguity audit and round-trip proof. | Stored fields change. Keep external result compatibility where the same causal facts are expressible. Pin migrated hashes and compare future directives against pre-migration behavior.                    |
| Should schedule-only writes be eligible for native planning?  | § 3.5.8 preserves the schedule without an outcome notice. § 7.2 describes recording.                                                             | A. Keep the ownership pin. B. Replace it by CA ruling with an external contract pin. Recommend B in the v3 qualification lane.                           | Preserve returned result, notices, stored schedule and stamps. Existing record hashes should agree.                                                                                                        |

**BELIEVED** Use a one-time normalization only if approved departures require regularized state. Build a versioned
conversion with an explicit list of unresolvable ingested shapes, reapply it and require exact idempotence, and
replay outcome suffixes from both pre- and post-normalized records. Compare assignments, provenance origins, side
identities, notices, warnings and time fields. Declare changed hashes one rule at a time. A remove-selector release
and `matchUpStatusCodes` sunset are already ruled for 8.x. TimeItem retirement, event payload changes and structural
normalization each need independent consumer validation.

## 6. Questions for CA

1. Should a generated TEAM draw with unassigned remaining rubbers count as stalled? Options are an unresolved
   line-up state, a repair to the draw audit, or a TEAM outcome defect. Recommend checking line-up eligibility and
   directly assigning the remaining rubbers before changing the outcome contract.
2. Should harvest failures stop `corpus:verify` before the other sources run? Keep fail-fast, or run all sources and
   fail after reporting per-source status. Recommend aggregated exit reporting with every existing assertion kept.
3. Should v3 retirement preserve tests that pin recording ownership? Recommend keeping each assertion until a
   candidate earns CA's explicit transition from an ownership assertion to a contract assertion.

4. Should a bare winner with no score and one with blank score strings be stored identically? Options are
   to treat them as equivalent in outcome laws or pin a canonical shape in 8.x. Recommend semantic equivalence
   for v2 and a canonical rule only as part of storage normalization.
5. Should coverage read the public JSONL incrementally? Options are bounded file generation or a streaming
   coverage reader. Recommend streaming so source identity and manifest semantics stay intact.

6. For F-005, prioritize the shared row 31 preflight so v2 refuses both TEAM inputs before the legacy fallback writes. Direct and non-rollback callers are exposed. TMX queue rollback and the CFS success-only save contain the defect on the reviewed production paths. Recommend scheduled v2 hardening. [Mechanism and scope](findings/F-005.md)

7. Should CA retire or retain the November 11 OUTCOME-101 / G4 condition? Recommend retaining the per-population cost obligation. The November 19 flip criterion used soak and walk parity, and 7.44.0 shipped with v2 as default. The reviewed decisions contain no explicit retirement of the November 11 condition. The close-out measured 1.5–2.6× v1 for sampled whole-call recordings. A passing relative regression bound leaves open the absolute cost owed. Join the historical cohorts to current ownership and judge remaining cohorts against the applicable bounds before selector removal. Ask CA to record retirement, remediation or acceptance for each remaining excess. [G4 ruling](https://github.com/CourtHive/Mentat/blob/27243d54/assessment/2026-11-11-outcome-v2-g4-ruling.md) · [close-out and flip criterion](https://github.com/CourtHive/Mentat/blob/27243d54/statuses/2026-11-19-outcome-v1-retirement-closeout-and-soak.md)

## 7. What I did not do, and why

- **VERIFIED scope** The private fixed corpus, production soak, remote test machines and private TEAM fuzz harness
  were unavailable.
- **VERIFIED scope** Per-reason function coverage is sampled. It does not identify which reached functions are
  exclusive to a reason or all paths reached by every recording.
- **VERIFIED scope** The seeded sweep and laws probes cover the cells described above. Full refusal-row ordering,
  dense flag combinations, mid-tie line-up changes and wider qualifying paths remain open.
- **VERIFIED scope** The E3 working view is retained in memory during the experiment. A production index used in
  admission and rebased across external state writes was outside this pilot.
- **VERIFIED scope** The schedule prototype is exploratory. The ownership assertion still fails.

## 8. Reproduction

From clean `7963e36968`, run the baseline and the public sources with installed locked dependencies.

```sh
pnpm install --frozen-lockfile
for mode in v1 v2 differential; do
  OUTCOME_PIPELINE=$mode TZ=UTC pnpm exec vitest run --maxWorkers=6 --reporter=dot
  OUTCOME_PIPELINE=$mode TZ=UTC pnpm run verify:team-arms
done
OUTCOME_PIPELINE=v2 pnpm run corpus:verify
for gate in verify:outcome-spec verify:any-count verify:layers check-types lint verify:hydrations; do
  pnpm run "$gate"
done
for mode in v2 differential; do
  OUTCOME_PIPELINE=$mode pnpm run verify:double-exit-sweep
  OUTCOME_PIPELINE=$mode TZ=UTC ROUTE_DIFF=1 pnpm exec vitest run src/tests/mutations/exitPropagation/routeDifferential.test.ts
  OUTCOME_PIPELINE=$mode TZ=UTC DEEP_CORRECTIONS=1 pnpm exec vitest run src/tests/mutations/exitPropagation/correctionDivergenceDeep.test.ts
done
```

Use `ext/report` for the instruments and new corpus case. Set `OUTCOME_EXTERNAL_CORPUS` to the absolute location of
the generated files and `OUTCOME_EXTERNAL_CORPUS_GLOB` to the selected JSONL population. The dedicated grammar and
scoring replayers use their own test files, as their directives are separate from tournament state mutations.

```sh
pnpm run corpus:manifest
pnpm run corpus:coverage
for mode in v1 v2 differential; do
  OUTCOME_PIPELINE=$mode TZ=UTC OUTCOME_EXTERNAL_PROPERTIES=1 pnpm exec vitest run src/tests/mutations/exitPropagation/outcomeExternalProperties.test.ts
  OUTCOME_PIPELINE=$mode TZ=UTC pnpm exec vitest run src/tests/corpus/grammarSource.test.ts src/tests/corpus/scoringSource.test.ts src/tests/corpus/scoringTimeline.test.ts src/tests/scoring/conformance
done
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_CENSUS_JSONL=/tmp/outcome-suite.jsonl pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts --maxWorkers=6 --reporter=dot
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_CORPUS="$PWD/.corpus-out" OUTCOME_EXTERNAL_CORPUS_GLOB='authored/*.jsonl' OUTCOME_EXTERNAL_CENSUS_JSONL=/tmp/outcome-authored.jsonl OUTCOME_EXTERNAL_REPLAY_JSON=/tmp/outcome-authored-replay.json pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts src/tests/corpus/outcomeExternalReplay.test.ts
node scripts/ext/summarizeOutcomeCensus.mjs suite=/tmp/outcome-suite.jsonl authored=/tmp/outcome-authored.jsonl
TZ=UTC OUTCOME_EXTERNAL_CORPUS="$PWD/.corpus-out/authored" OUTCOME_EXTERNAL_FIXPOINT_JSON=/tmp/outcome-fixpoint.json pnpm exec vitest run --config scripts/ext/outcomeFixpoint.config.mts src/tests/corpus/outcomeExternalReplay.test.ts
TZ=UTC OUTCOME_PIPELINE=v2 OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e2.json pnpm exec vitest run src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
TZ=UTC OUTCOME_EXTERNAL_TEAM_COST_JSON=/tmp/outcome-e4.json pnpm exec vitest run src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
```

Run sampled writer reach and the index experiment on the same test branch.

```sh
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_COVERAGE_JSONL=/tmp/outcome-writers.jsonl pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts src/tests/mutations/outcome/recorded
node scripts/ext/summarizeOutcomeWriters.mjs /tmp/outcome-writers.jsonl
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_INDEX=1 OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e3.json pnpm exec vitest run --config scripts/ext/outcomeIndex.config.mts src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
TZ=UTC OUTCOME_EXTERNAL_INDEX=1 OUTCOME_EXTERNAL_TEAM_COST_JSON=/tmp/outcome-team-index.json pnpm exec vitest run --config scripts/ext/outcomeIndex.config.mts src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
```

Run the prototype's existing tests and manifest in a worktree at `ext/v3-schedule`. The focused assertion is
expected to fail until CA rules on the ownership contract.

```sh
OUTCOME_PIPELINE=differential TZ=UTC pnpm exec vitest run src/tests/mutations/outcome/recordedScheduleCall.test.ts src/tests/mutations/outcome/ownedLocalWrites.test.ts
OUTCOME_PIPELINE=differential TZ=UTC pnpm exec vitest run --maxWorkers=6 --reporter=dot
OUTCOME_PIPELINE=v2 pnpm run verify:corpus-manifest
```

The full oracle E1 arm uses oracle JSONL generated by `pnpm run corpus:oracles`.

```sh
TZ=UTC OUTCOME_EXTERNAL_CORPUS="$PWD/.corpus-out" OUTCOME_EXTERNAL_CORPUS_GLOB='oracles/*.jsonl' OUTCOME_EXTERNAL_FIXPOINT_JSON=/tmp/outcome-oracle-fixpoint.json OUTCOME_EXTERNAL_REPLAY_JSON=/tmp/outcome-oracle-replay.json pnpm exec vitest run --config scripts/ext/outcomeFixpoint.config.mts src/tests/corpus/outcomeExternalReplay.test.ts
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_CORPUS="$PWD/.corpus-out" OUTCOME_EXTERNAL_CORPUS_GLOB='src-*.jsonl' OUTCOME_EXTERNAL_REPLAY_JSON=/tmp/outcome-harvest-replay.json OUTCOME_EXTERNAL_REPLAY_DETAILS=/tmp/outcome-harvest-details.jsonl OUTCOME_EXTERNAL_CENSUS_JSONL=/tmp/outcome-harvest-census.jsonl pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts src/tests/corpus/outcomeExternalReplay.test.ts
```

To extend both curves to the two upper TEAM sizes, run the large-TEAM arms separately.

```sh
TZ=UTC OUTCOME_PIPELINE=v2 OUTCOME_EXTERNAL_LARGE_TEAM=1 OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e2-large-team.json pnpm exec vitest run src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
TZ=UTC OUTCOME_PIPELINE=v2 OUTCOME_EXTERNAL_INDEX=1 OUTCOME_EXTERNAL_LARGE_TEAM=1 OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e3-large-team.json pnpm exec vitest run --config scripts/ext/outcomeIndex.config.mts src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
```

The follow-up writer reach uses two direction-write files and the first 20 FMLC census cases.

```sh
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_COVERAGE_JSONL=/tmp/outcome-direction-writers.jsonl pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts src/tests/mutations/outcome/ownedDirectionWrites.boundaries.test.ts src/tests/mutations/outcome/ownedDirectionWrites.relabels.test.ts
mkdir -p /tmp/outcome-loser-replay
rg -F 'oracle/census/first-match-loser-consolation-' .corpus-out/oracles/oracle-census.jsonl | head -20 > /tmp/outcome-loser-replay/oracle.jsonl
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_CORPUS=/tmp/outcome-loser-replay OUTCOME_EXTERNAL_COVERAGE_JSONL=/tmp/outcome-loser-writers.jsonl pnpm exec vitest run --config scripts/ext/outcomeCensus.config.mts src/tests/corpus/outcomeExternalReplay.test.ts
node scripts/ext/summarizeOutcomeWriters.mjs /tmp/outcome-writers.jsonl /tmp/outcome-direction-writers.jsonl /tmp/outcome-loser-writers.jsonl
```

Reproduce the drift classification after the harvested replay above, using the directory that contains the original source JSONL files. To repeat the quiet E2 comparison, use one worker, run the two commands in sequence with other benchmarks stopped, and record host CPU availability.

```sh
node scripts/ext/triageHarvestDrift.mjs /tmp/outcome-harvest-details.jsonl "$OUTCOME_EXTERNAL_CORPUS" > /tmp/outcome-drift-triage.json
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e2-quiet-standard.json pnpm exec vitest run --maxWorkers=1 src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
OUTCOME_PIPELINE=v2 TZ=UTC OUTCOME_EXTERNAL_LARGE_TEAM=1 OUTCOME_EXTERNAL_COST_JSON=/tmp/outcome-e2-quiet-large-team.json pnpm exec vitest run --maxWorkers=1 src/tests/mutations/exitPropagation/outcomeExternalCost.test.ts
```
