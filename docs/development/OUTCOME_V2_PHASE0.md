# Outcome v2 Phase 0 progress

Status: A3 and A4 committed locally (`efd9836d`); A5 runners committed on the Mentat task branch (`1715a9a0`);
A6 finding-record fields implemented on top. The shrinker half of A6, merges and the immutable baseline remain open.
Branch: `feat/outcome-v2-phase0`, from `origin/dev` at `7afc4399a194a0c1ed0399d3f07e19390d787b94`.
Verified: 2026-10-19. No push, merge, release or deployment. A candidate Phase B census runs on Button at
`efd9836d` (launched 22:50Z, `~/censuses/outcome-v2-phase0-20261019/phase-b`); its rows predate the A6 fields.

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

## Remaining

1. A5 is committed on Mentat branch `feat/outcome-v2-phase0-runners` (`3d829464`, `1715a9a0`): verdicts from
   manifests and receipts, comparative gates and launchers, 48 failure-injection tests passing locally and on
   Button. `1715a9a0` fixed wrappers that put Button's fnm node ahead of injected stubs. Not yet merged.
2. Rebaseline at one immutable revision and calibrate cost. Adjudicate newly exposed v1 findings separately
   from instrument changes. The A6 shrinker change remains optional.
3. S0/S1, then v1 closure (Phases B/C), then the v2 write slices. No production default change.

Nothing is pushed or merged. No complete Phase 0 attestation is claimed.
