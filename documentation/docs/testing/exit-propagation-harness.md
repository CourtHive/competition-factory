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

## The five suites

| Suite                            | What it does                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exitPropagationMatrix.test.ts`  | 600 cells: draw type × drawSize × participantsCount × exit status × `propagateExitStatus`. Plants an exit through the real mutation path, then drives the draw forward deterministically. |
| `transitionProperties.test.ts`   | do/undo identity, idempotence, monotonicity — properties of a _mutation_, not of a state.                                                                                                 |
| `derivationAgreement.test.ts`    | asserts that `matchUpActions` and `setMatchUpStatus` agree about what is permitted.                                                                                                       |
| `doubleExitStatusParity.test.ts` | runs the same draw and schedule twice, once per double-exit status, and asserts the results are identical after renaming the vocabulary. See the caution below for what it cannot see.    |
| `entryOrderInvariance.test.ts`   | applies the same pair of double exits in both orders across eight draw types and asserts the record is identical — the property the renaming oracle above is structurally blind to.       |

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

## Related

- [Exit Propagation](/docs/concepts/exit-propagation) — the behaviour these suites guard
- [Testing Overview](./testing-overview) — the wider testing toolkit
- [mocksEngine](./mocks-engine-overview) — draw generation used throughout the harness
