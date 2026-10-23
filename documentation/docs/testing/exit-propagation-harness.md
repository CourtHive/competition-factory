---
title: Exit Propagation Harness
---

## Overview

`src/tests/mutations/exitPropagation/` holds ~950 tests that guard the
[exit-propagation](/docs/concepts/exit-propagation) cascade. This page is for **contributors** —
consumers of the published package do not need it.

It exists because the pipeline's failure mode is not the one coverage measures.
`isActiveDownstream.ts` was at **100% branch coverage** when it shipped 444 spurious refusals across
five draw types. Every path ran; the predicate was wrong. Coverage measures whether code ran, not
whether the result was right.

## The suites

| Suite                                    | What it does                                                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exitPropagationMatrix.test.ts`          | 600 cells: ten draw types × drawSize × participantsCount × exit status × `propagateExitStatus`. Plants an exit through the real mutation path, then drives the draw forward deterministically.                                                                       |
| `exitPropagationMatrixExtension.test.ts` | the same body over the seven draw types the 600 never exercised — round robin (with and without playoff), the FIC `TO_QF`/`TO_R16` variants, lucky draw, feed-in, playoff — 400 cells from a separate seed range. Added in 7.4.0; clean on first contact.            |
| `correctionDivergence.test.ts`           | 192 cells: a first-round mistake corrected, against the direct entry of the right outcome.                                                                                                                                                                           |
| `correctionDivergenceDeep.test.ts`       | 1,600 cells: the mistake is the deepest exit of a twelve-step prefix. Buckets each cell as identical / provenance-only / incomparable / refused / severe and ratchets the counts; the baseline is severe 0. Runs under `pnpm verify` (`DEEP_CORRECTIONS=1`), ~5 min. |
| `stalledPositionBudget.test.ts`          | **Deleted 2026-10-10.** It replayed all 1,000 matrix cells and ratcheted `STALLED_POSITION` findings down to zero; at zero the rule was promoted to an `error` and, as its header instructed, the ordinary `valid` assertions became the guard.                      |
| `routeDifferential.test.ts`              | the same outcome entered with and without `allowChangePropagation`, compared.                                                                                                                                                                                        |
| `transitionProperties.test.ts`           | do/undo identity, idempotence, monotonicity — properties of a _mutation_, not of a state.                                                                                                                                                                            |
| `derivationAgreement.test.ts`            | asserts that `matchUpActions` and `setMatchUpStatus` agree about what is permitted.                                                                                                                                                                                  |
| `doubleExitStatusParity.test.ts`         | runs the same draw and schedule twice, once per double-exit status, and asserts the results are identical after renaming the vocabulary. See the caution below for what it cannot see.                                                                               |
| `entryOrderInvariance.test.ts`           | applies the same pair of double exits in both orders across eight draw types and asserts the record is identical — the property the renaming oracle above is structurally blind to.                                                                                  |

Every cell in the matrices is a separate parameterised test, which is why the suite's test count
moves by hundreds when a draw type is added.

Helpers live in `src/tests/testHarness/exitPropagation/`, which is excluded from coverage as test
infrastructure.

## Why these oracles

The hard problem is not generating scenarios; it is knowing whether the resulting bracket is
_correct_. Writing an expected value by hand for a 64-draw COMPASS with a double walkover cascading
through three back structures is not feasible, which is how assertions decay into
`expect(result.success).toEqual(true)`.

Two kinds of oracle avoid needing an expected value at all:

**Transition properties** are statements about a mutation and its inverse. An error must not mutate;
do-then-undo must restore; the same outcome applied twice must not write twice. None of them
encodes any knowledge of how a draw is supposed to progress, so none can inherit a bracket
misconception from the code under test.

**Agreement oracles** exploit the fact that the codebase already contains several implementations of
the same concept. You do not need to decide which is right to assert that they must agree. The
double-exit parity oracle is one: `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT` differ only in the status
they produce downstream, so the same schedule must yield the same bracket after renaming.

:::caution The parity oracle cannot see a defect that forces the two statuses to converge
It renames `DOUBLE_DEFAULT` to `DOUBLE_WALKOVER` and `DEFAULTED` to `WALKOVER` before comparing its
two runs, so any bug producing exactly that convergence is invisible to it — and one was: the
convergence flavour was hardcoded to `DOUBLE_WALKOVER`, relabelling a default-on-default pair, while
the parity suite stayed green throughout.

It is also blind for a second, independent reason. Its driver applies a **single** exit status per
run, so it never constructs a matchUp where a walkover and a default meet. Only the randomized sweep
mixes statuses within one draw, which is why that whole class went unnoticed.

**A green parity suite is not evidence about the difference between the two statuses.** Gate that
class on a within-run property instead — comparing two fields of one record, or the same pair of
outcomes applied in both orders, as `entryOrderInvariance.test.ts` does.
:::

A reference implementation of bracket semantics is deliberately **not** part of this. For the
feed-profile and FMLC draw types it would re-derive the same assumptions from the same mental model
and re-inherit the same bugs — a second draft by the same author is not an oracle.

## The quarantine registry

`knownFailures.ts` names every currently-failing (cell, property) pair, each with a written
reference explaining the defect.

It is **not** a suppression list, and not a warn-only mode — a warning nobody must act on gets muted
within weeks. It is enforced in **three** directions:

1. a **new** failure fails the run;
2. a **fixed** failure also fails the run, telling you to delete its entry — so the list can only
   shrink, and no fix lands silently;
3. a **stale** key fails the run, so a mistyped entry cannot excuse nothing forever.

A green run therefore means _exactly the known defects, no more_, which is something a gate can be
built on.

Working with it:

- **Fixing a defect** — make the change, run the suite, watch it fail with "quarantined property no
  longer fails", delete the entry, run again. The failure is the confirmation.
- **Adding a cell** — never to make CI green. Reproduce it, read the source, write the reference. If
  you cannot write the reference you do not understand the failure yet.

## The at-scale sweep

`sweep.test.ts` is inert unless `SWEEP=1`, so CI skips it in microseconds.

```sh
SWEEP=1 SEED_START=1 SEED_COUNT=5000 OUT=/tmp/sweep.jsonl \
  npx vitest run src/tests/mutations/exitPropagation/sweep.test.ts
```

Where the in-suite matrix is deterministic and canonical-ordered — it must reproduce from a cell
name — the sweep gives that up to reach states ordering cannot, and buys reproducibility back with a
seed plus delta-debugging. Findings are **shrunk before they are written** and deduplicated by
fingerprint, so the output is a defect list rather than a log. Schedules routinely reduce from 30
steps to 1–3.

It shares the committed oracles rather than copying them; a second implementation would drift from
the one CI enforces, and the two would then disagree about what a finding is.

Read the counts carefully: a fingerprint is (draw type + property + schedule shape), which is
**finer** than "distinct defect". Many fingerprints are the same root cause reached by different
schedules. It measures reachability and diversity, not bug count.

## The seed-level census

`census.test.ts` is inert unless `CENSUS=1`. It answers a different question from the sweep, and the
two numbers are **not comparable**.

```sh
CENSUS=1 SEED_START=9000001 SEED_COUNT=600 OUT=/tmp/census.jsonl \
  npx vitest run src/tests/mutations/exitPropagation/census.test.ts
```

The sweep shrinks each finding and then deduplicates on its fingerprint, so a seed that fails with a
shape already claimed in that worker writes nothing — its output is a list of distinct **shapes**.
The census does neither: one row per **failing seed**, the unshrunk first failure, no dedup.

That is what a before/after measurement needs. "Sixteen closed, one new" is a statement about seeds,
and a deduplicated file cannot support it. Every census figure quoted in this area's history is this
measurement rather than the sweep's.

### Frozen schedules, for a fair A/B

`generateSchedule` walks the **live** draw and picks among matchUps that currently hold two
participants — so it calls the engine under test. A fix therefore changes the schedules themselves,
and a naive before/after mixes defect closure with schedule drift. Emit once, replay on both trees:

```sh
CENSUS=1 … SCHEDULES_OUT=/tmp/schedules.jsonl …   # emit only, no replay
CENSUS=1 … SCHEDULES_IN=/tmp/schedules.jsonl  …   # replay those exact steps
```

### Per-seed attribution has a prerequisite

A census is only meaningful if a seed's outcome depends on that seed alone. Until `randomPop` stopped
consuming the module-level pool of nine mock tournament names, it did not: from the tenth
`generateTournamentRecord` in a process the seeded RNG ran one draw out of step, and `nonRandom`
stopped determining the tournament. Three failing seeds then could not be reproduced in isolation.

If a seed ever again fails in a run but not alone, suspect that class first — the guard is
`src/tests/mocks/mockTournamentNameReuse.test.ts`.

## The stall census at scale

A **stall** is a `STALLED_POSITION` finding: one participant, no winner, in a matchUp nobody else can
ever reach. The census reports only a seed's first failing property, so a seed that fails something
else earlier reads there as "no stall"; `stallCount.test.ts` (`STALL_COUNT=1`) replays every step of a
schedule file and asks the finished draw directly, whatever the severity of the finding.

```sh
STALL_COUNT=1 TZ=UTC SCHEDULES_IN=/tmp/schedules.jsonl OUT=/tmp/stalls.jsonl \
  npx vitest run src/tests/mutations/exitPropagation/stallCount.test.ts
```

It runs in three arms — `allowChangePropagation` off and on under the default policy, and
`doubleExitPropagateBye: false` — because each arm reaches states the others do not. At scale (40,000
seeds per arm per run) the stalling seeds of each run are frozen with the schedules emitted in their
arm and held by a **shrink-only ratchet**: `stallScaleRegression.test.ts` and its successors assert
that the set of stalling instances EQUALS an `OPEN` list, so a new stall fails and a seed that stops
stalling fails too, until its entry is removed — a fix records itself by deleting a line. Every seed
found by the runs of 2026-10-07 to 2026-10-10 (126 instances across three ratchets) is closed in every
arm as of 7.9.0; the `OPEN` lists are empty. Runs 8 to 10 (2026-10-11, after 7.9.0) found 1 / 0 / 1,
1 / 1 / 1 and 0 / 0 / 3 (off / on / policy-off); every one of those seeds also stalls on 7.9.0 — the
runs sample fresh seeds, not new code — and all are closed in 7.10.0, held by
`stallScaleRegression20261011h.test.ts` (8 instances, `OPEN` empty).

**Classify a stall before tracing it.** Replay the seed with and without `rollbackOnError: true` and
count refusals that changed the draw. A stall that exists only without rollback is the downstream
effect of a refusal-after-write (`ERROR_IMPLIES_NO_MUTATION`). That is a defect in the method, not a
case rollback covers: a method's error must leave the record unchanged on a direct call, so the root
is in the pipeline and is fixed there — the replay with rollback only separates it from a stall
with another cause. Then ask why an exit
did not travel as far as its participant would have: run 9's only stall looked like a RULE 4 refusal
and was a carried exit dropped at a BYE in a structure's last round, two steps earlier.

**Census failures are not stalls.** Each run also reports scenarios failing any OTHER property
(`DRAW_INCONSISTENCY`, `ERROR_IMPLIES_NO_MUTATION`, `MONOTONIC_DECISION`, …). That count has never been
zero and is flat across runs 7–10 (roughly 60 / 300 / 125 per 40,000 seeds); a release's
"0 / 0 / 0" is the stall count.

**The early-exit arm.** The at-scale census only scores matchUps with both participants present, so it
never records an exit before the opponent arrives. `exitBeforeArrivalCensus.test.ts` (120 seeds) does,
and it was the last promotion criterion: it showed 7 end-state stalls when `STALLED_POSITION` first ran
as an error, closed by a detector exemption (a lone occupant inside a double exit) and an FMLC
reservation fix.

Before any fix in this area merges, the eight **frozen census arms** (`sched-w1`, `sched-w2` and
`sched-de` under each flag, plus the two policy arms) are replayed on the branch and on `dev` and
diffed by seed: `opened` must be zero. `STALLED_POSITION` shipped as a `warning` and was promoted to an
`error` once an at-scale run read zero in all three arms — the seventh run, on 7.9.0 (`dev`
`bdc5c4b258`), did — so a stalled draw is no longer `valid`; the rule and the run history are in
`Mentat/planning/STALLED_POSITION_AT_SCALE.md`.

The TEAM arms (`pnpm verify:team-arms`) drive duals line by line. In the uneven-dual arm a double exit
on one rubber can leave a DOMINANT_DUO dual at 1-1 with every rubber finished: no score can decide it.
That is the director's decision (`setMatchUpStatus` with a `winningSide` on the dual), and since
7.10.0 the driver takes it once nothing else is playable instead of abandoning the draw — the
promotion to `error` is what exposed that the arm had been auditing abandoned draws.

`OUTCOME_PIPELINE=differential` is a second gate for the same code (see
[the outcome pipeline § 7.1](/docs/concepts/outcome-pipeline#71-two-implementations-s2)): it runs in
CI only for pull requests into `master`, so run it locally before a checkpoint.

## Traps worth knowing before you extend this

Each of these cost real time and produced confident, wholly incorrect results.

- **Never order by a generated id.** `structureId` and `matchUpId` are fresh UUIDs; sorting on them
  silently randomises a schedule and invalidates any comparison built on it.
- **`getEvent` and `getState` return deep copies.** A property trap set on an object from either can
  never fire. Instrument the source, and log the _inputs_ to a decision rather than its effects.
- **Seed correlation is real.** An LCG's first output is near-linear in its state, so consecutive
  small seeds land in the same bucket — seeds 1..60 once chose the same draw type sixty times out of
  sixty while appearing to sample all ten. `sweep.ts` mixes the seed before use.
- **Each relational property needs its own freshly generated draw.** They mutate, so running them in
  sequence makes each one's precondition the previous one's post-state.
- **Distinguish representational from real differences.** Empty-vs-absent `matchUpStatusCodes` and
  `score`, and `drawPositions` padding, are normalised in `projectDraw`. Each normalisation
  collapses empty against absent only, so genuine residue is still caught.
- **The vitest transform cache goes stale** and starts failing to resolve `@Tests/...` for newly
  created files while committed specs still resolve. It looks exactly like a broken import; clear
  `node_modules/.vitest-cache` and `node_modules/.vite`.
- **A killed census launcher leaves its lanes running.** `pkill` of the script that launched eight
  arms stops the script, releases its lock and reverts nothing; the vitest children keep writing. The
  next run into the same files then double-counts every arm, and a byte-identical duplicate line reads
  as "opened". One output directory per attempt, and before trusting a summary check that each file
  holds exactly one `SUMMARY` line (measured twice on 2026-10-10, on Button and locally).

## Related

- [Exit Propagation](/docs/concepts/exit-propagation) — the behaviour these suites guard
- [Testing Overview](./testing-overview.md) — the wider testing toolkit
- [mocksEngine](./mocks-engine-overview.md) — draw generation used throughout the harness

## Measurement limits

The census replay restores the scheduled record before each relational probe/property pair, so
later properties do not inherit earlier probes' mutations. Relational coverage counts forward,
second-apply and clear calls separately.

Refused and thrown calls compare the entire stored tournament record using canonical JSON, including
timestamps, event entries, nested TEAM lines, notes, schedule and extensions. No timestamp is exempt,
including `updatedAt`; a refusal must preserve its exact value. A changed record reports
`ERROR_IMPLIES_NO_MUTATION` with the first divergent JSON Pointer. A throw also reports
`NO_EXCEPTION_ESCAPES`. Object key order and undefined object properties follow JSON semantics.
The snapshot reads stored state rather than the engine's outward-copy query.

Accepted-call transition comparisons still observe `projectDraw`. Replay also samples one in 32
accepted calls against the full record, with an offset derived from the scenario seed and an
independent accepted-call ordinal. It consumes neither generation randomness nor generated ids.
The census SUMMARY's `coverage.projectionAudit` reports attempted samples, full/projection change
counts, omitted-field writes and bounded examples with JSON Pointers. It records omitted fields
even when the projected outcome also changed. A test can request an interval of one explicitly.
This is a coverage ledger: successful writes to omitted fields may be legitimate, so the ledger
does not turn them into outcome failures or claim semantic preservation.

Every omitted field has exact refusal/throw coverage and the accepted-call sample. Additional
accepted-call gates are listed below and in `fieldProjections.ts`'s `PROJECT_DRAW_OMISSIONS`.

| Omitted field or representation                                                | Additional accepted-call coverage                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Timestamps, including normalized positionAssignment timestamps                 | Sample only; cross-executor `updatedAt` value agreement waits for Phase C                    |
| `schedule`                                                                     | Schedule differential arm                                                                    |
| `notes`, formats, types and other matchUp metadata                             | No general preservation gate                                                                 |
| `sideStatusCodes`, `matchUpStatusCode`                                         | Round-trip projection                                                                        |
| Nested `tieMatchUps`, `lineUp`                                                 | TEAM matrices test outcome semantics; field projections compare populated lineUps            |
| Event/draw entries, seeds, extensions outside positionAssignments              | Field projections compare paths when exercised; empty fixtures establish no coverage         |
| Tournament/event/draw metadata, links, structure metadata, root factory stamps | No general preservation gate                                                                 |
| Empty/absent and padded drawPosition representation                            | Sampled full-record/projection verdict mismatch; accepted calls have no raw identity promise |
| Every other stored field, including future fields and other draws              | Sample only; no dedicated semantic gate                                                      |

The full-record check does not cover global or subscriber state.
Empty/absent normalization also limits accepted-transition differences. Record the revision, settings, mode,
seed range, replay disposition and projection when reporting a zero. Native-mode evidence does not
establish LEGACY/BRIDGE behavior. A frozen zero describes those fixtures; new seeds can find failures.

`DO_UNDO_IDENTITY` compares a projection, and leaves out by ruling what forward play records in some entry orders and
not others: arrival entries (F4) and the `{ BYE, BYE }` origin pair (F5), the legacy `matchUpStatusCodes` array (F1,
counted by the `CODES_CONSISTENT` ledger), and BYE drawPositions rendered as `BYE` (R10). From 2026-10-20 to
2026-10-22 it also left out BYE claims on a loser seat a BYE matchUp feeds (CA ruling (b)); the `byeClaims` ledger is
retired (Mentat P58), so nothing claims a BYE and that exclusion is gone. Each omission is policed for truth by
`ARRIVAL_TRUE`: an entry that is present must be true, so an omission hides only absence, never a falsehood.

`LOSER_SEAT_DERIVED` holds every replay step to a reading of the draw rather than of the claim ledger (since
2026-10-21; the ledger is being retired, Mentat P58). For every matchUp with a loser link, `feederSendsNobody` says
whether it will ever send anyone across that link: not when it holds a BYE, is a double exit, was won against an exit,
is pending with a double exit's produced exit that came along its winner path (one that came over a loser link waits for
the award, P39), or feeds a FIRST_MATCHUP link that excludes every candidate loser. A propagated BYE on
the seat it feeds must have such a reason, and a participant there must not. Whether a seat whose feeder sends nobody
shows a BYE or a produced exit is left to the policy and the rules that place them. Measured before it was asserted:
2,493,487 seat observations in the census gate inputs and 118,803 in the exitPropagation suite, with no contradiction.

### Replay dispositions and receipts

`replay` returns `{ verdict, complete, counts, findings, coverage, projectionAudit }`. Its functional
verdict is `build-failed`, `failed` or `clean`. Completeness is separate: a clean functional result
with a missing coordinate or a matchUp that is not scoreable has `complete: false`. Verification
must require completeness as well as the absence of findings. A refused call is counted as refused,
never accepted; a throw has its own count. A build failure cannot become an empty clean replay.

`counts` reports planned schedule steps, scheduled calls attempted, all calls attempted/accepted/
refused/thrown, observations checked for atomicity, skips by reason, unvisited steps and build failures.
All-call totals include the relational forward, second-apply and clear calls; `coverage` retains their
separate stage counts. Shrinking and historical first-finding behavior fixtures use `replayFailure`,
which permits skips and returns the first finding. That adapter is not a verification verdict.

Census, policy, per-step integrity and stall instruments write a `REPLAY` receipt for each input
scenario and aggregate execution counts/dispositions in `SUMMARY`. Missing histories and recorded
generation failures are build failures, including in stall counting; input records are not silently
filtered out. Per-step integrity shares the policy-aware schedule executor, skips relational probes,
and reports transient inconsistencies as failed even if the final draw is clean.

### Finding records

Each finding names the call that produced it and where it first diverged, so a row reproduces on its
own:

- `stage`: `build`, `schedule` (with the zero-based `step` index), `final` (checks on the draw the
  schedule produced), or the relational probe's `forward`, `second-apply` or `clear` call.
- `probe`: every finding a relational probe raises carries the probe, not only the first one.
- `firstDivergence`: for a refusal or throw that wrote, the JSON Pointer of the first changed field in
  the tournament record. For `DO_UNDO_IDENTITY` it is `<structure|round|position> <field>`, the first
  projected field the round trip left changed.

Census, policy, per-step and stall finding rows also record the arm (from the workers'
`ALLOW_CHANGE_PROPAGATION`/`PROPAGATE_BYE`, overridable with `CENSUS_ARM`), the policy definitions
the scenario replayed under (`null` for none), and `revisions: { source, harness }`. `source` is the
revision that generated the schedule; generated schedules now record it as `revision`, and older
frozen inputs have `null`. `harness` is the replaying checkout's commit, suffixed `-dirty` when its
tracked files differ. Policy rows deliberately omit `probe`, because the runners key findings on it
and a baseline replayed at an older revision has none. The shrinker is unchanged: it still matches
on the property name alone, and keeps only the minimized witness.

These structured outputs require verdict-aware runners. The older DONE/seed-grep runners must not
be used as acceptance evidence for this instrument until the Phase 0 runner repair is complete.

The original v1 write pipeline remains the acceptance target. The v2 preparation/differential work
still delegates accepted writes to v1; it is not an independent write implementation proving v1
correctness. See [pipeline implementation status](../concepts/outcome-pipeline.md#71-two-implementations-s2).
