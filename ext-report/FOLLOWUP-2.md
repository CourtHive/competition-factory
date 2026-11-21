# V3-1 handoff for CA

**Decision requested.** May a native outcome change the diagnostic `stack` returned by the public synchronous engine? On an already-stamped lucky double exit, the candidate preserves the record and delivered notices in five draw sizes but changes that array. Earlier comparisons excluded helper stacks. The current instructions require matching returned results and reserve observable changes to CA. The ownership experiment stopped here.

**VERIFIED.** On merged dev `0408a87119` all three modes return `{ success: true, stack: ["noDownStreamDependencies", "setMatchUpStatus", "setMatchUpStatus"] }`. Under the candidate, v2 returns `{ success: true, stack: ["setMatchUpStatus"] }`. Differential still returns v1's array. The existing lucky-repeat check drops the field before comparing, which explains its green result. This is a prototype compatibility difference on a successful call. [Raw captures and two-command control in the design PR](https://github.com/CourtHive/competition-factory/pull/6493/files)

## Exit and cascade design

**VERIFIED.** The instrumented merged-dev v2 suite passed 33,626 tests, skipped 1,565 and recorded 9,399 successful whole calls. The two leading families account for 6,290 in 117 nonempty reason × draw type × route cells. The four additional occurrences compared with the accepted post-schedule-pilot census are three exit/winner and one cascade/winner. The design PR covers landing and withdrawal, first-match eligibility, held seats, onward chains, deep corrections and the observables each route must preserve. **BELIEVED** risk ranks are design judgments. [Design and full draw-type table](https://github.com/CourtHive/competition-factory/pull/6493/files)

| Route                    |      Exit |   Cascade |
| ------------------------ | --------: | --------: |
| winner                   |     1,769 |     1,265 |
| double-exit              |       945 |         0 |
| clear-score              |       473 |         0 |
| completed-to-double-exit |        84 |       373 |
| apply-values             |       363 |         0 |
| remove-directed          |         0 |       347 |
| swap                     |       315 |       330 |
| noop                     |        15 |         0 |
| existing-winner-removed  |         7 |         0 |
| clear                    |         4 |         0 |
| **Total**                | **3,975** | **2,315** |

**VERIFIED.** Nine of the 15 exit/noop calls were stamped lucky repeats whose recorded program had no notices or storage operations. Six unstamped repeats wrote a matchUp, including one lucky repeat. The baseline and candidate five-case public-return probes cover draw sizes 5, 7, 8, 11 and 12. They establish neither a candidate census delta nor ownership qualification. No engine PR was opened.

## Ruling and work held

- **BELIEVED recommendation.** Explicitly extend the earlier diagnostic-stack exclusion to V3-1. On approval, resume the bare stamped repeat under the material-result contract, with recorder-off controls, paired census, step replay and the three ordinary full suites. If CA requires the full raw return, keep these calls recorded pending a design that preserves the array.
- **VERIFIED prior harvest baseline.** The previous boundary fix left 953 drifting scenarios across 292 source tests, including 890 with matching results and changed state. No new attribution or engine finding is claimed in this round. Keep the harvest diagnostic. [Prior paired evidence](followup/recorder-bound.json)
- **Pending at the stop.** The larger, interleaved planner-index benchmark has not run. Its prior three-seed results remain the only paired measurements from this workstream. The private fixed corpus, production soak and private TEAM fuzz remain owed. [Prior benchmark](followup/planner-timing.json)
