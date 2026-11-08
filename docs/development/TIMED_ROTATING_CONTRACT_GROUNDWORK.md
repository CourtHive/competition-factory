# Timed rotating-partner contract groundwork

This is the first, internal slice for competition-factory issue #6115. It defines the scoring
boundary before enabling timed Americano or Mexicano tournament writes. It is based on merged
`dev` at `f55e5de02912496f04ee2332555fc75bff1da736`.

## Activation boundary

The new helper and types are not registered with an engine, governor, tools assembly or package
barrel. No existing production caller imports them. The standalone scoring schema is not referenced
by `tournament.schema.json`. The public profile validator, profile mutation, policy query, generated
rounds and saved tournament shapes are unchanged: timed rotating-partner profiles are still refused.

Outcome dispatch, v1/v2 planning and settlement, standings, score analysis and the decided-result
record are untouched. This slice admits no new result shape to either outcome pipeline. Its tests
pin the existing public refusal and unchanged tournament state alongside the new pure contracts.
This is preparation for activation, not a claim that timed tournaments can be played end to end.

## Configuration and policy

The proposed scoring input is one of:

```ts
{ combinedPointTotal: 24, selectedVariant: { tieResolution: 'ALLOW' } }
{ kind: 'COMBINED_POINTS', combinedPointTotal: 24 }
{ kind: 'TIMED', minutes: 15, selectedVariant: { tieResolution: 'DECIDING_POINT' } }
```

The pure resolver accepts an already inherited scoring policy and resolved tally policy. It does
not look up policies, apply precedence, or write defaults into records. Existing combined-point
policy fields retain their meaning; a separate `timed` entry deliberately enables timed selection:

```ts
{
  defaultVariant: { tieResolution: 'ALLOW' },
  permittedVariants: [{ tieResolution: 'ALLOW' }],
  permittedPointTotals: [24, 32],
  timed: {
    defaultVariant: { tieResolution: 'ALLOW' },
    permittedVariants: [{ tieResolution: 'ALLOW' }, { tieResolution: 'DECIDING_POINT' }],
    permittedMinutes: [12, 15, 20],
  },
}
```

An absent `timed` entry disables timed selection. A present malformed entry is refused, including
an explicitly undefined entry. Inside a valid timed entry, omitting `permittedMinutes` permits any
positive safe-integer duration. Empty, duplicate or invalid lists are refused. A default must belong
to its permitted list. Timed WIN_BY_MARGIN and mixed timed/combined fields are refused.

The tally policy remains required and must validate. Timed DECIDING_POINT with
`decidingPoints: 'EXCLUDE'` is refused with `ERR_INVALID_VALUES` and the specific explanation
`timed deciding-point exclusion requires decided-result evidence`. Timed ALLOW can retain EXCLUDE
because it has no deciding rally. `overtimePoints` remains required but has no effect on the timed
contract: these timed formats contain no overtime. No new decider evidence field is introduced.

## Historical reads and format mapping

`normalizeRotatingPartnerScoreContract` reads a saved contract independently of today's policy.
It requires a resolved tie rule, validates the closed shape and returns a fresh object. A combined-point
contract with an omitted `kind` and one with explicit `COMBINED_POINTS` normalize to the original
shape without `kind`. Historical input is never rewritten. Future comparisons must compare those
canonical values rather than raw JSON; this slice does not change existing comparison sites.

| Contract                     | Format            |
| ---------------------------- | ----------------- |
| Combined 24, ALLOW           | `SET1-S:P24`      |
| Combined 24, DECIDING_POINT  | `SET1-S:P24DP`    |
| Combined 24, WIN_BY_MARGIN 2 | `SET1-S:P24WB2`   |
| Timed 15, ALLOW              | `SET1-S:T15P`     |
| Timed 15, DECIDING_POINT     | `SET1-S:T15P/TB1` |

The format owns the segment clock. The configuration's minutes produce that code; future integrity
checks must reconstruct it and refuse a disagreement with the stored matchUp format. `/TB1` has no
clock and does not become an overtime period. Existing combined-point format logic is reused.

`src/global/schema/rotatingPartnerScoring.schema.json` specifies the proposed scoring input, resolved
contract and policy structures. It is an internal schema fragment, not the tournament admission
schema. JSON Schema validates structure; the runtime policy validator additionally enforces default
membership in the permitted list. Policy permission and tally compatibility are runtime checks.

## Activation work still required

1. Coordinate new timed write shapes with the outcome owner before enabling them.
2. Widen public profile, policy and historical-round types and the tournament schema together.
   Preserve profile version 1 and canonical comparison of legacy combined-point contracts.
3. Wire the shared resolver at selection and generation, including the EXCLUDE refusal. Extend
   preview/apply comparisons, retries, historical reads and integrity checks in the same slice.
4. Integrate explicit timed completion, score retention, individual standings, corrections and
   status treatments through every outcome path. Retain the completed 0–0 refusal and score locks.
5. Qualify the consumer sequence separately. This groundwork does not enable a consumer feature.

The source test is `src/tests/queries/matchUps/rotatingPartnerContractGroundwork.test.ts`. It covers
runtime/schema boundaries, legacy normalization, timed mapping, policy/tally refusals and the public
activation boundary. Existing profile, policy, round, standings and combined-point tests provide the
regression baseline. Targeted pipeline runs do not substitute for full outcome settlement qualification.

## Local verification, 8 November 2026

- Existing baseline: 185 tests in five files; lint and type checking passed.
- Final focused suite: 255 tests in six files under each of v1, v2 and differential, full matrix tier,
  UTC, one worker. The new file contains 70 tests.
- Deliberately allowing timed play without policy opt-in, ignoring deciding-point EXCLUDE and
  changing `/TB1` to `/TB2` each caused assertion failures. The helper was restored byte-for-byte
  and the 70 tests passed again.
- Generated API checks, type ratchets, layering, attribute audit, exit-tenant and outcome-spec
  checks passed. Full lint, format check and the worktree build passed.
- Factory server suite: 19 tests passed in 11 files. Built CJS, ESM and bundled-consumer runtime
  smoke checks and the API-surface guard passed.
- Only five new files were added. No existing production source, public export or tournament schema
  changed. The built package contains neither the internal helper nor its new types.

The full repository coverage/census and outcome settlement qualification gates were not run.
Nothing has been pushed or published by this slice.
