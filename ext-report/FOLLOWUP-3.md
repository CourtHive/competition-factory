# V3 qualification handoff · refusal atomicity

**Decision requested on F-007.** A single scheduling directive can return `ERR_INVALID_RESUME_TIME` and leave a 09:00 start time on a match. The reduced two-entrant fixture reproduces the write in v1, v2 and differential with rollback off. All three rollback-on controls restore the complete record. The public scheduling method performs the write directly. I recommend a separate scheduling hardening change to validate the submitted fields before applying the first one. [Finding, fixture and reproduction](https://github.com/CourtHive/competition-factory/pull/6498)

## F-006

**VERIFIED.** The shared writer now checks the assignments needed to score a corrected TEAM line before withdrawing its old result and retallying the dual. The 24 rollback-off regression cases cover three stored exit statuses, both winning sides, singles and doubles lines, and two scoring situations. With the other two points split, the legal correction reverses the dual winner. With those lines unplayed, it leaves the dual undecided. Without line-ups, all three modes preserve the whole record and return `ERR_MISSING_ASSIGNMENTS`. Attaching line-ups makes the same 24 corrections succeed in all three modes. All 24 unchanged-record cases fail on the unpatched writer. F-006 remains moderate hardening for the next factory release. [Engine change and permanent matrix](https://github.com/CourtHive/competition-factory/pull/6499)

**VERIFIED on PR head `72ae92e9c4`.** Each full suite ran from a clean worktree with `TZ=UTC OUTCOME_PIPELINE=<mode> pnpm exec vitest run --maxWorkers=7 --reporter=dot`. Each passed 2,296 files and skipped 43. These runs qualify the engine fix independently of the proposed suite-wide gate.

| Mode         | Passed | Skipped | Failed | Elapsed seconds |
| ------------ | -----: | ------: | -----: | --------------: |
| v1           | 33,678 |   1,565 |      0 |          579.23 |
| v2           | 33,678 |   1,565 |      0 |          560.68 |
| differential | 33,678 |   1,565 |      0 |          826.03 |

## Refusal invariant and harvest

**VERIFIED.** The draft tooling checks the stored JSON records of sync and async public calls. It compares a refused directive with its own starting state so a previous successful directive in a rollback-off queue can retain its work. Suite setup also loads the check during capture and replay. A separate reader checks archived steps for a changed hash or a nonempty patch alongside an error. A standalone four-test queue control passed. Applied to the scheduling source file, the gate flagged six tests across the native and legacy configurations, covering invalid resume, stop and end times. A fresh capture of those parameterized tests produced eight scenarios and 16 steps. The independent archive reader flagged exactly the same six writes among eight refusals. [Invariant and reader](https://github.com/CourtHive/competition-factory/pull/6500)

| Capture                                               | Scenarios |   Steps | Refusals | Changed refusal steps | Aggregate refusals needing live directive boundaries |
| ----------------------------------------------------- | --------: | ------: | -------: | --------------------: | ---------------------------------------------------: |
| Historical full capture                               |    41,829 | 181,471 |    8,562 |                   118 |                                                    0 |
| Bounded follow-up directory, including oracle sources |     7,786 |  22,594 |    1,942 |                    45 |                                                    2 |

The populations overlap. The bounded scan includes 7,671 recorded scenarios from the drift study and 115 additional scenarios in the directory. Of its 45 flags, 15 carry injected `ERR_FORCED` or `ERR_PLANTED` codes, five come from tests forcing the settle bound, and two are the archived F-006 witness. Each ledger row gives the scenario, step, method, error, before/after hashes and patch paths. The historical capture predates the boundary repair. Use current-engine, rollback-off reproductions for engine findings. [Bounded ledger](followup/refusal-audit/bounded.jsonl.gz) · [Historical ledger](followup/refusal-audit/historical.jsonl.gz)

**VERIFIED on the Laver Cup source.** Each mode's instrumented suite stopped at the first failure on the unpatched engine. Each identified the original F-006 line's changed winning side and the missing-assignments error. With the F-006 patch and invariant together, the same walk and all 24 new cases passed (25/25). All six independent controls from #6495 also passed.

**Gate status.** The general invariant is red. Keep the tooling PR in draft while reviewing the live violations. The harvest remains diagnostic. The earlier 953 drift scenarios span 292 source tests. The F-007 stop condition paused causal attribution and the larger interleaved planner-index run. The private fixed corpus, production soak and private TEAM fuzz remain outstanding.

## Ownership and baseline

**VERIFIED.** The two approved changes have merged. The shared parity helper now checks every material returned field and requires an array whenever v1 returns an array stack. The lucky-repeat regression and schedule pilot use the shared checks. Fourteen focused files passed 148 tests. [Lucky-repeat ownership](https://github.com/CourtHive/competition-factory/pull/6496) · [Public stack contract](https://github.com/CourtHive/competition-factory/pull/6494) · [Shared parity PR](https://github.com/CourtHive/competition-factory/pull/6497)

**VERIFIED historical baseline for this round.** After #6488 the suite recorded 9,395 whole calls. Three free-consolation exit controls and one additional cascade in the existing Laver Cup walk raised the pre-lucky baseline to 9,399. Moving the nine stamped lucky repeats brought the fixed-workload count to 9,390. The design and original F-006 evidence PRs now target `ext/report`. [Exit/cascade table and reconciliation](https://github.com/CourtHive/competition-factory/pull/6493) · [F-006 evidence](https://github.com/CourtHive/competition-factory/pull/6495) · [Ownership measurements](FOLLOWUP-2.md)
