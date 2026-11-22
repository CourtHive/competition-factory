# Outcome v3 review handoff — refusal hardening and planner cost

**F-007 is qualified for controlling-agent review.** Each full Button suite passed 33,682 tests with 1,565 skipped in v1, v2 and differential at `f1217f57ea`. All 33 GitHub checks passed on that commit. [Validation receipt](refusal-triage/button-validation.json) · [F-007 PR](https://github.com/CourtHive/competition-factory/pull/6503)

## Release decisions

F-006 assignment preflight and the shared stack-array parity assertion are on factory dev at `fff9b81b75` and `c4a629c135`. CI passed before each merge. Every material return field participates in parity. A diagnostic stack returned as an array must retain that shape. [F-006](https://github.com/CourtHive/competition-factory/pull/6499) · [Shared assertion](https://github.com/CourtHive/competition-factory/pull/6497)

The exit/cascade round used a pre-slice census of 9,399 successful recordings. Four observations account for the difference from 9,395 after the schedule pilot. Three came from the F-005 free-consolation regression controls and one from the Laver Cup progression. On a fixed workload, the stamped lucky double-exit repeat slice moved exactly nine calls, bringing the count to 9,390. The pre-slice census belongs to that workload and revision. [Design and census reconciliation](FOLLOWUP-2.md)

## Refusal invariant

The ready-for-review invariant passed the complete v2 suite on Button (33,678 passed, 1,565 skipped), plus 499 tests across the 31 implicated files in each of v1 and differential. It tracks named tests and immutable historical observations. A new failing source or an additional changed field fails the gate. An inherited factory-stamp exception in a live test also requires the mutation flag to have been set before the call. Each defect entry should be removed in the same integration as its fix. [Invariant PR](https://github.com/CourtHive/competition-factory/pull/6500)

| Evidence                            | Real defects | Deliberate injections | Recording artefacts | Total |
| ----------------------------------- | -----------: | --------------------: | ------------------: | ----: |
| Six originally reported suite cases |            6 |                     0 |                   0 |     6 |
| Bounded capture                     |           18 |                    21 |                   6 |    45 |
| Historical full capture             |           23 |                    25 |                  70 |   118 |

Each archive has six real observations already fixed by F-005 and F-006. They have no active exception. The archive totals count occurrences, including repeated calls and tests shared between captures. The 64 historical boundary artefacts have a fresh matching source, method and refusal with an unchanged record. Separate live observations explain the six inherited stamps in each archive. The new source capture had 44 acknowledged changes and zero unexplained changes among 1,845 refusals. Three source tests failed during recording, including two non-finite inputs rejected by the encoder. [Full ledger, limitations and replay procedure](https://github.com/CourtHive/competition-factory/pull/6515)

F-008 through F-011 cover bulk outcome directives, ad hoc reset, TEAM line-up replacement and scheduling-profile insertion. The broader live suite also found F-012 through F-018 in timing, court deletion, venue edits, participant scale, BYE assignment, penalty edits and participant creation. Each finding has an independent starting record, direct and rollback-off queue reproductions, and a positive rollback control. Bulk outcomes and bulk court deletion have existing tests that expect successful-prefix writes. Their public compatibility implications need review before changing those writers. [Finding index](https://github.com/CourtHive/competition-factory/pull/6515)

A subsequent full Button run exposed F-019. A ratings write restores participant time items after a refusal but leaves the mutation flag set. Its only stored change was the tournament timestamp. Deterministic controls reproduced the direct and rollback-off failures in all three modes. This takes the live exception list to 53 test identities. The archived 45 and 118 counts stay as measured. [F-019 evidence](findings/F-019/README.md)

Button ran all twelve packaged finding reproducers together against the reviewed engine. Every one of the 45 rollback-off cases reached the expected error and then failed exactly the unchanged-record assertion. All 45 rollback-on controls passed. [Consolidated controls](refusal-triage/consolidated-controls.json)

Button ran the local validation. The eleven individual finding PRs were closed after their directory tree hashes matched the consolidated review. Eight unfinished finding workflows and the superseded triage workflow were cancelled. Evidence-only commits to the unprotected ext/report review skip the GitHub matrix. Writer and invariant changes retain their PR checks.

The controlling agent replaced the 292-source drift-attribution task with this refusal triage. Harvest parity remains diagnostic. G4 remains due before the 8.0 selector removal.

## F-007 qualification

The candidate exercises the full schedule writer on an isolated draw and reuses the preflight clock readings on commit. The stop/resume/end refusals, a missing venue, a nonexistent home participant and a valid multi-attribute control have permanent tests in both storage modes with rollback disabled. The archived timing, court and conflict refusals were also clean on the candidate.

All three suites at `e929531c33` passed 33,681 tests, skipped 1,565 and failed one existing expectation. The schedule facade previously ignored the dedicated setter's refusal for a nonexistent home participant. The previous coverage test accepted a valid date alongside an invalid ID and checked only the success flag. The candidate refuses the entire request. The complete-request validation ruling applies to the home ID as well. At `f1217f57ea`, the success fixture uses an assigned player and verifies that both the date and the home ID were saved. The negative fixture retains the original record check. All 32 focused scheduling tests passed. [Candidate and suite status](https://github.com/CourtHive/competition-factory/pull/6503)

## Paired planner benchmark

Forty-eight fresh/retained pairs completed 128- and 256-player singles draws and 16- and 32-team college draws. Each field used twelve seeded starting records and six pairs in each arm order. Each measured pair agreed on its final stored record and action sequence. A separate, untimed pair for the first seed in each field also agreed after every call on the plan, material return, stack-array shape, subscribed notices and stored record. The workload includes partial live scores, completed scores, walkovers and corrections. TEAM calls target assigned singles and doubles lines.

| Field       | Calls per arm across 12 draws | Median per-call ms, fresh → retained | p95 per-call ms, fresh → retained | Median mutation time per draw ms, fresh → retained | Paired change with 95% interval |
| ----------- | ----------------------------: | -----------------------------------: | --------------------------------: | -------------------------------------------------: | ------------------------------: |
| SINGLES 128 |                         3,048 |                          1.49 → 1.29 |                       1.72 → 1.53 |                                          372 → 321 |         -13.6% [-13.9%, -12.5%] |
| TEAM 16     |                         2,880 |                        11.42 → 11.89 |                     13.97 → 14.71 |                                      2,549 → 2,667 |            +4.4% [+3.7%, +5.4%] |
| SINGLES 256 |                         6,120 |                          2.84 → 2.49 |                       3.31 → 3.17 |                                      1,424 → 1,260 |          -11.5% [-23.3%, -5.7%] |
| TEAM 32     |                         5,952 |                        22.23 → 23.09 |                     27.19 → 28.74 |                                    10,135 → 10,645 |            +5.0% [+4.8%, +5.3%] |

The per-call columns are medians across draws of each draw's median and p95. Draw mutation time sums the measured engine calls. Elapsed traversal time, which also includes finding the next match, is reported separately in the JSON. Intervals resample the twelve seed pairs 10,000 times. They describe variation across draws on this host. Each run used Node v26.8.1 on a 28-core Apple M3 Ultra. Pre-run idle ranged from 97.1% to 97.7%. Median idle during measurement was 94.0% and the minimum sample was 68.4%.

The host log includes the untimed trace passes. The lowest idle sample occurred during the untimed 32-team trace, while verification hooks for the consolidated evidence ran on Button.

The measured singles workloads favor retaining the index. On college TEAM line scoring, frequent invalidation and rebuilding limit reuse. Keep the index test-only. This study measures one host, one TEAM format and one consumer-style mix. [Harness and commands](https://github.com/CourtHive/competition-factory/pull/6516) · [Distributions and intervals](followup/paired-planner/summary.json) · [Individual calls and index counters](followup/paired-planner/samples.jsonl.gz) · [Host samples](followup/paired-planner/host.json)
