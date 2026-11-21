# V3-1 handoff for CA

**Decision requested on F-006.** Correcting a defaulted, unassigned TEAM line can return `ERR_MISSING_ASSIGNMENTS` after recording the attempted score, removing the previous winner and changing the parent dual tally. All three modes expose the changed record with rollback off. Recommend a separate hardening patch that preserves the refusal code and checks the assignment before changing either result. CA can instead defer the fix with explicit acceptance of the partial write. [Finding, minimized input and six controls](https://github.com/CourtHive/competition-factory/pull/6495)

**CA ruling on stack.** Successful and error returns preserve the array shape wherever v1 returns an array. The entries are diagnostic and can differ between modes and versions. Every other returned field remains material. This is documented in outcome spec §7.2 and the public Factory Errors guide. [Documentation PR](https://github.com/CourtHive/competition-factory/pull/6494)

## Exit and cascade design

**VERIFIED.** The instrumented merged-dev v2 suite passed 33,626 tests, skipped 1,565 and recorded 9,399 successful whole calls. The two leading families account for 6,290 in 117 nonempty reason × draw type × route cells. The post-#6488 census counted 9,395. The three free-consolation controls added by #6487 contribute three exit/winner recordings in FEED_IN_CHAMPIONSHIP. The existing eight-position, seven-entrant Laver Cup walk contributes one additional cascade/winner in SINGLE_ELIMINATION. The TEAM reason stays at 968 across six changed cells. A per-source comparison reproduces every aggregate difference. The design PR covers landing and withdrawal, first-match eligibility, held seats, onward chains, deep corrections and the observables each route must preserve. **BELIEVED** risk ranks are design judgments. [Design and full draw-type table](https://github.com/CourtHive/competition-factory/pull/6493/files)

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

## Lucky-repeat qualification

**VERIFIED.** The recorder-off test exercises five draw sizes, checks that v2 bypasses the v1 writer, and compares all material fields, the applicable diagnostic-array shape, the record including timestamps, the object graph and ordered delivered notices. A refused outcome also exercises the array rule. Boundary probes confirmed both stamped lucky double statuses are native; the unstamped and ADAPTIVE controls still record. The independent harvest contains the exact nine pre-call states, selected by source test, matchUp and directive. All nine one-step scenarios matched their stored expected results and hashes in each mode (27 replays). [Ownership PR](https://github.com/CourtHive/competition-factory/pull/6496) · [Harvested records](followup/v3-1/lucky-repeat-records.jsonl.gz) · [Source manifest](followup/v3-1/lucky-repeat-sites.json) · [Replay totals](followup/v3-1/lucky-repeat-replay.json)

**VERIFIED on `c30a26ef04`.** The three ordinary suites each passed 33,627 tests, skipped 1,565 and had zero failures. With the workload held fixed, successful whole-call recordings fell from 9,399 to 9,390. Exactly one cell changed: `exit / LUCKY_DRAW / noop` fell from ten to one. The remaining repeat lacks its scored-time stamp. Both instrumented arms passed 33,626 tests and skipped 1,565 using the original suite inputs. [Counts](followup/v3-1/lucky-repeat-qualification.json) · [Reproduction](followup/v3-1/REPRODUCE.md)

## Harvest finding and remaining work

**VERIFIED.** F-006 came from inspecting error-return patches in the same 172-file harvest used for the drift study. Two copies of the same Laver Cup call produced the recorded changed hash in all three modes. It therefore passes an ordinary mode/harvest comparison. The separate atomicity oracle fails. The one-call reduced fixture has two teams and one dual. This is a new finding, independent of the lucky-repeat change. [Original hash controls](followup/v3-1/f006-harvest-controls.json) · [Reduced fixture and oracle](https://github.com/CourtHive/competition-factory/pull/6495/files)

The stop condition on a refused call that writes applies. Attribution of the 292 drifting source tests and the larger interleaved planner-index benchmark are held for CA. The prior diagnostic census has 953 drifting scenarios, including 890 with matching results and changed state. The private fixed corpus, production soak and private TEAM fuzz remain owed. [Prior harvest](followup/recorder-bound.json) · [Prior planner timing](followup/planner-timing.json)
