# Outcome v2 Phase 0 progress

Status: A3, A4 and the A6 finding-record fields are on this branch (`efd9836d`, `de61075a`); A5 runners on Mentat
`feat/outcome-v2-phase0-runners`. Phase B (the normal census) ran at `efd9836d`; its four engine findings have fixes on
separate branches from `dev`. Branch: `feat/outcome-v2-phase0`, from `origin/dev` at
`7afc4399a194a0c1ed0399d3f07e19390d787b94`. Verified: 2026-10-20.

## Orientation and sequence

The controlling tracker is Mentat's top TASKS entry. The executor plan §4 and census instrument repair
plan establish A3 full-record observation, A4 replay dispositions/accounting and A5 derived runner
verdicts. The October 19 closing status records every F1–F9/O1 ruling; older pending-review wording
is superseded. S0/S1 may precede Phase C; v2 ownership of writes waits for v1 closure. Production uses v1.

Read alongside the plans: the October 17 exit-cascade/census assessment, outcome pipeline open questions
and specification, design-flaw punch list (P15/P26/P27), canonical coding/architectural standards,
ATC instructions, active claims and the five latest session logs. Source confirmed the omitted fields,
ambiguous build-failure/null result, per-step policy omission and unconditional runner DONE convention.

## A3: full-record refusal checks and accepted-call sampling

- `recordDiff.ts` captures canonical JSON and reports the first divergent JSON Pointer using the existing
  patch generator. It is available to the future differential executor without importing test code.
- Every observed call captures the stored tournament before invocation. Refused/thrown calls compare it
  exactly, including timestamps, notes, schedule, entries and TEAM lines. Throws report both exception
  and atomicity failure when they wrote. No refused-call timestamp exemption applies.
- A seeded one-in-32 accepted-call sample reports full/projection change counts, omitted-field paths
  and bounded examples. Sampling uses an independent accepted-call ordinal, not generation RNG or ids.
  It records omitted fields even when projected outcomes also changed. This measures coverage drift;
  legitimate accepted stamps/schedule writes are not automatically functional failures.
- `PROJECT_DRAW_OMISSIONS` and the harness documentation state the gates and limits for every omitted
  category, including unknown future fields. Sampled observation is not a semantic preservation promise.
- Planted faults cover omitted-field refusals, accepted notes, thrown writes, nested TEAM lines and an
  idempotence second apply that refused after writing only notes. That last case exposed a remaining
  relational early-return hole; it now runs the full-record checker. Throw handling also covers clear.
- The shared canonical serializer visits sparse array slots with `Array.from`, emitting JSON null rather
  than invalid text such as `[,4]`. Source and regression controls pin the defect and its correction.

## A4: replay dispositions and actual work

- `replay` returns a functional verdict (`build-failed`, `failed`, `clean`), independent completeness,
  counts, findings, relational coverage and the projection audit. Missing/unscoreable coordinates are
  named skips and lost coverage. Build failures cannot return clean. Calls attempted, accepted, refused,
  thrown and checked include all relational stages. Unvisited scheduled work is explicit.
- `replayFailure` preserves permissive first-finding semantics for shrinking and historical behavioral
  fixtures; their imports explicitly name this adapter. They make no completeness claim. Verification
  runners use structured results, not that adapter. The broad import-only fixture changes preserve the
  original functional assertions.
- Per-step integrity and stall counting share the census's policy-aware schedule executor. Per-step
  integrity omits relational probes and retains intermediate observations. A transient inconsistency
  remains failed even when the final draw is clean. A policy-dependent planted fault proves the scenario
  policy reaches the executor.
- Census, policy, per-step and stall instruments write per-scenario REPLAY receipts and SUMMARY totals.
  Missing histories and recorded generation failures are build failures; the stall instrument no longer
  filters them out. The current Mentat runners have not yet been adapted to these new rows.

## A6: finding records that reproduce (fields only)

- `PropertyFailure` gains `stage` (`build`, `schedule`, `final`, `forward`, `second-apply`, `clear`), `step` for a
  scheduled call, and `firstDivergence`: the full-record JSON Pointer for a refusal/throw that wrote, or
  `<coordinate> <field>` for a round-trip residue. Observations carry their stage, so findings raised through the
  replay observer are tagged as well as those the properties return. Every relational finding carries its probe.
- `findingRecord.ts` adds the arm, effective policy definitions and `revisions: { source, harness }` to census,
  policy, per-step and stall finding rows. Generated schedules record their `revision`; older frozen inputs read
  `source: null`. The harness revision carries `-dirty` for a modified checkout.
- Runner finding keys (`seed`, `property`, probe coordinates) are unchanged. Policy rows still omit `probe`, so a
  baseline replayed at an older revision keys identically.
- Not done, per the executor plan's recommendation: the shrinker still matches on property name only, takes no
  explicit policy, and keeps only the minimized witness. Take it if Phase B adjudication needs it.
- 13 focused tests plant writes on relational calls 1, 3 and 5, on a scheduled step, and a round-trip residue,
  and pin the arm mapping and provenance. A live two-scenario policy-off emit/replay smoke recorded the generating
  revision and policy on each emitted schedule and replayed both clean and complete.

## Validation

- Initial baseline: 13 focused tests, lint and production types passed. An intentionally interrupted
  full-suite baseline (exit 130 after about 14 minutes) is incomplete evidence, not a whole-suite pass.
- Initial A3.1–A3.3 slice: six old-detector fault tests failed then passed; 3,389 exit-propagation tests and
  29 focused differential tests passed. This is historical evidence for that earlier slice.
- Continuation: 49 focused tests passed, including build/skip/refusal/throw counts, relational accounting,
  policy-aware per-step integrity, transient findings, accepted-call sampling and missing stall histories.
- A live two-scenario policy-off emit/replay smoke accounted for six scheduled operations in census,
  per-step integrity and stall counting, with no skips or findings. Relational census totals accounted
  for 31 completed calls. This is a small execution control, not instrument calibration.
- Current broader default exit-propagation run: 325 files / 3,409 tests passed; 16 files / 1,539 opt-in
  tests skipped (341 files total), 460 seconds. The opt-in arms were not exercised.
- Final focused differential run: 6 files / 50 tests passed, including the final TEAM-line refusal
  control through census replay itself. The golden corpus manifest passed with
  all 131 committed scenario hashes unchanged, including authored, grammar and scoring controls.
- Final lint, production types, test-type ratchet, generated-source checks, attribute audit, isolated
  build, formatting, import order and markdown checks passed. Canonical factory remains clean on dev.
- A6 (on top of `efd9836d`): full default suite 1,832 files / 18,615 tests passed (20 files / 1,549 opt-in tests
  skipped), 289 seconds; final-tree focused replay/atomicity/projection/finding-record run 41/41; lint, types and
  formatting green. Logs: `/tmp/outcome-v2-phase0/a6-*`.
- Logs and smoke outputs: `/tmp/outcome-v2-phase0/a4-*`. No whole-suite or Button attestation.

## Phase B: the normal census (2026-10-19 22:50Z to 2026-10-20 08:17Z)

Ran on Button at `efd9836d`, output `~/censuses/outcome-v2-phase0-20261019/phase-b`, 6 processes. Root verdict:
`complete: false`, `pass: false` (`frozen: child incomplete`, `fresh: findings present`).

| stage                                     |                  scenarios | result                                         |
| ----------------------------------------- | -------------------------: | ---------------------------------------------- |
| calibration (run-20 stored histories)     |          6,300 (2,100 × 3) | complete, pass, 0 failing                      |
| frozen: 14 S8 gate sets + stored openings | 101,247 openings + 14 sets | 0 findings, 0 stalls; 20 histories incomplete  |
| fresh: seeds 30,000,001–30,045,000        |       135,000 (45,000 × 3) | complete; 0 stalls; 4 findings, all policy-off |

- **Cost.** Census replay ~11 min per 2,100 histories per process against the plan's ~2 min estimate: k ≈ 5, above the
  2–4 budget (risk K7). The fresh stage took ~6.4 h.
- **Projection audit** (off arm, calibration): 2,213 sampled accepted calls, 340 changed fields outside the projection,
  chiefly `schedule` and `updatedAt`. Coverage-drift measurement, not functional failures.
- **The 20 incomplete histories** have scheduled steps that no longer hold two participants (`not-scoreable`). 18 replay
  complete at the S8 emitting ref `bf5553012b`; a bisect over first-parent `dev` attributes each to an exit-propagation
  fix: #5576 (12), #5599 (4), #5510 (2). One representative per fix was read parent vs fix; in each the parent state was
  the defective one. **CA ruled 2026-10-20 to retire the 18 in a ledger, never delete them**: Mentat
  `retired-inputs-phase-b.json` (`b685fd9c`) records each identity; runner support and re-emission are open. The 2 gate-set
  histories (on 20625776, on 21027128) were incomplete before S8 and are not yet adjudicated.
- **The four findings**, re-replayed at `de61075a` for the A6 fields, all DO_UNDO_IDENTITY at the `clear` stage, all
  engine-side (shrunk keeping property, probe and first divergence; `~/census-work/shrunk/`):

| seed     | draw                   | mechanism                                                                                                  | fix (branch from `dev`)                                                                          |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 30004303 | COMPASS 32/30          | a convergence dissolved through `applyWithdrawnExits` never got back the BYE `reclaimSingleExitBye` took   | `fix/census-b-30004303`: owed once the call settles; plus CA ruling (b) in the round-trip oracle |
| 30007402 | COMPASS 32/32          | `withdrawByeSeats` cleared a BYE with its last claim though the seat's feeder was a BYE matchUp            | `fix/census-b-30007402`                                                                          |
| 30009232 | CURTIS_CONSOLATION 8/6 | a WALKOVER ⇄ DEFAULTED relabel missed the carry recorded on a BYE-held matchUp                             | `fix/census-b-30009232`                                                                          |
| 30030527 | MFIC 32/32             | a provenance entry kept the side it was written on when its feeder's side changed (rule 3 vs feeder order) | `fix/census-b-30030527`: end-of-call re-key, CA ruling (1)                                       |

- **CA rulings 2026-10-20.** (b): a BYE claim on a loser seat a BYE matchUp feeds is history-dependent by design, so the
  round trip leaves it out and polices it (both state rules, never and always claiming, were measured and each reopened
  a pinned fix). (1): re-key provenance by the feeder's current side; rule 3 unchanged. Design flaws recorded in Mentat
  DESIGN_FLAWS_PUNCH_LIST: P58 (the BYE-claim ledger records who, not why), P59 (side-keyed provenance is unstable).
- **Validation of the fix branches (local + Button standalone):** each passes the exitPropagation folder (322 files),
  the full default suite and `pnpm verify`; each pin fails without its fix. No comparative Button gate has passed yet:
  the A5 runners validate this branch's receipt format, which `dev` lacks, so the fixes are gated after this branch
  merges.

## Remaining

1. Merge this branch, then the A5 runners (Mentat `feat/outcome-v2-phase0-runners`, which also carries the gate
   install/output isolation fix `930a93ac` and the retirement ledger).
2. Rebase each fix branch onto the merged harness and gate it on Button (frozen arms, then openings); then its PR.
3. Runner support for retired inputs (`RETIRED` rows, re-emission at the current revision); adjudicate the two
   gate-set histories.
4. Rebaseline at one immutable revision; S0/S1; v1 closure (Phase C rulings F2, F9, per-pass write reports, no
   swallowed settle errors); then S2–S7. The A6 shrinker change remains optional.

No production default changes. Nothing is merged.
