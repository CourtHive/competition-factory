# F-006 · A refused TEAM line correction changes the line and dual

**VERIFIED on merged dev `0408a87119`.** In the public synchronous engine, correcting a previously defaulted singles line in a TEAM dual can return `ERR_MISSING_ASSIGNMENTS` after changing the tournament record. With queue rollback disabled, v1, v2 and differential leave the same changed hash. Differential returns the error normally. With rollback enabled all three restore the original hash.

## Harvest evidence

The generated Laver Cup source is `src/tests/mutations/outcome/recordedTeamCall.test.ts`, the seeded SINGLE_ELIMINATION walk with eight positions and seven entrants. Parts 154 and 155 are duplicate one-step witnesses in the post-#6489 harvest. An unassigned line stored as DEFAULTED with side 2 winning is submitted as a 6–1 6–1 win for side 1. The refused call stores the score on the line, changes its status to IN_PROGRESS, removes its winner and changes its parent dual's score from 3–4 to 3–2. The source also records timestamp changes. The initial hash ends in `9bbf0bf4` and the changed hash ends in `8d260f577`. All six rollback/mode controls were reproduced from the archived pre-call state.

The stored post-error hash was exactly what the harvest expected. This witness surfaced by examining patches on error returns in the same 172-source-file harvest used for drift attribution. Counting mode disagreements or drift alone misses it. It is a separate call from the F-005 held-seat retirement. It also differs from the bare half-arrived dual in spec C22: the refused call changes a line's result and its parent's tally.

## One-call reproduction

**VERIFIED.** The attached fixture reduces the draw to two teams, one DOMINANT_DUO dual and three lines. Its pre-call state contains a defaulted unassigned singles line, with a stored side-2 win, and a 0–1 parent score. One `setMatchUpStatus` directive attempts to score that line. The opt-in test runs the six combinations from fresh copies of this record and checks the refusal code before checking the whole-record hash. It tests the atomicity contract, so the three no-rollback cases fail on the baseline.

```sh
TZ=UTC pnpm exec vitest run --config ext-report/findings/F-006/vitest.config.mts --reporter=verbose
```

| Queue setting | v1                       | v2                       | Differential             |
| ------------- | ------------------------ | ------------------------ | ------------------------ |
| Rollback off  | Refuses, record changes  | Refuses, record changes  | Refuses, record changes  |
| Rollback on   | Refuses, record restored | Refuses, record restored | Refuses, record restored |

Reduced-fixture hash before the call: `sha256:bb773265b0b6f16a2a2b36684eb26c21d6b717403626fe78d76db42bb2116554`. After the refused call without rollback: `sha256:f76f6fa83b46af70ba6f0ef6b174dcdf512c2ead9a225b18ed8ee3874876ca93`.

**BELIEVED severity: moderate.** Direct callers and queues using rollback off can retain an incorrect line score and team tally. The tested rollback control protects the CourtHive queue configuration identified in the F-005 review. Recommend a separate v2 hardening decision: preserve the existing refusal and make it atomic, with a legal assigned-line correction as a positive control. Confine any change to the correction path; C22 already has an explicit compatibility decision for a different input.

[Minimized record and directive](one-call.json) · [Executable oracle](refusal.test.ts)
