# Competition Profile

`drawDefinition.competitionProfile` is a first-class, versioned configuration attribute. It describes the competition format; matchUps, scores and lifecycle state remain in their existing record locations. It is separate from `competitionFormat`, which describes how a sport is played.

## Configure a rotating-partner draw

Create an AD_HOC doubles draw with no matchUps, then set its profile:

```js
const result = tournamentEngine.setCompetitionProfile({
  drawId,
  competitionProfile: {
    version: 1,
    format: 'MEXICANO',
    entrantScope: 'INDIVIDUAL',
    matchUpType: 'DOUBLES',
    scoring: { combinedPointTotal: 32 },
    standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
    pairing: {
      seed: baseSeed,
      algorithmVersion: 1,
      groupBy: 'ADJACENT_STANDINGS',
      partners: 'FIRST_FOURTH_SECOND_THIRD',
    },
    completion: { kind: 'ROUND_COUNT', rounds: 7 },
  },
});
```

For Americano, use `format: 'AMERICANO'`, `pairing: { seed, algorithmVersion: 1 }` and `completion: { kind: 'PARTNERSHIP_COVERAGE' }`. Store the Americano generator's `seedUsed` or Mexicano's `baseSeed`. Seeds must be safe integers; combined point totals and round counts must be positive safe integers. Version and pairing algorithm version are currently `1`.

Tie resolution belongs to the governing scoring policy, rather than the profile. This increment stores configuration only: it does not implement fixed-total scoring, tied completion, individual standings, participant admission or round application. Those capabilities must be implemented before these profiles can drive complete competitions.

## Read, change and remove

```js
const { competitionProfile } = tournamentEngine.getCompetitionProfile({ drawId });
const result = tournamentEngine.removeCompetitionProfile({ drawId });
```

Queries and writes copy profile data, so changing caller objects does not change the record. An absent profile returns success with an undefined profile. Mutations emit the ordinary draw modification notice and the containing tournament record can be saved by its consumer. The attribute is first-class in every schema write mode; no extension migration is involved.

Once any matchUps exist in the draw or its nested structures, attaching, changing or removing the profile returns `EXISTING_MATCHUPS`. Reapplying an identical profile is an idempotent success. This protects already-generated rounds from being reinterpreted. Future correction and configuration-amendment workflows require their own explicit contracts.

## Ladder configuration and state

A LADDER draw accepts `{ version: 1, format: 'LADDER' }`. This identifies its format without changing existing ladder policy resolution. Challenge eligibility, movement and validation rules remain in the inherited ladder policy.

Rank standings are stored in structure position assignments; rating standings are derived from participant rating scales. Challenges and result attestations use matchUps and their timeItems, while dated participant scale items preserve standing history. Neither those records nor mutable standings belong in a policy or this configuration attribute. A later ladder normalization can add explicit configuration fields without copying its existing state here.

## Governing scoring policy

`getRotatingPartnerScoringPolicy({ drawId, structureId?, selectedVariant? })` returns the resolved
`contract`, `scoringPolicy` and `selectionLocked`. It reads the existing `scoring` policy's
`rotatingPartners.AMERICANO` or `rotatingPartners.MEXICANO` section. Policy precedence is
structure → draw → event → tournament; a nearer scoring policy replaces the whole scoring policy,
rather than merging nested fields. Missing format rules use the engine default; malformed rules fail.

```typescript
const policyDefinitions = {
  scoring: {
    rotatingPartners: {
      AMERICANO: {
        defaultVariant: { tieResolution: 'ALLOW' },
        permittedVariants: [{ tieResolution: 'ALLOW' }, { tieResolution: 'DECIDING_POINT' }],
        permittedPointTotals: [24, 32],
      },
    },
  },
};
tournamentEngine.attachPolicies({ drawId, policyDefinitions });
const result = tournamentEngine.getRotatingPartnerScoringPolicy({ drawId });
```

A singleton permitted list locks the organizer's choice. Otherwise the selected variant must match
one of the permitted variants exactly. `WIN_BY_MARGIN` requires a safe-integer `winningMargin`
of at least two; other variants prohibit a margin. Point totals must be positive safe integers and,
when restricted, belong to `permittedPointTotals`.

The engine default permits `ALLOW`, `DECIDING_POINT`, and `WIN_BY_MARGIN` with margin two,
defaulting to `ALLOW`. This query validates and previews configuration; use the persistence mutation below to save a
selection. Neither method changes manual/live scoring yet. Resolved rules must be captured when applying a round.
Separate deciding phases, extra-point tally attribution and individual standings remain open work.

## Persisting the scoring choice

Call `setRotatingPartnerScoring({ drawId, selectedVariant? })` before generating matchUps. Omitting
`selectedVariant` saves the approved policy default. The mutation stores the choice in
`competitionProfile.scoring.selectedVariant`; point total and selected variant together define the
resolved match contract. Direct profile writes validate these choices against the governing policy.

`getRotatingPartnerScoringContract({ drawId })` reads that saved contract without consulting current
policies. It refuses an unconfigured profile. This is the query historical scoring must use; the
policy query remains the preview of current governing rules. Changing inherited policies cannot
rewrite the saved contract. Repeating an identical write succeeds without effect; changing or removing
the profile is refused once any matchUps exist. The new mutation also respects DRAWS locks.

This stores the draw-level match contract only. Per-round provenance, future-round amendments,
separate deciding phases and tally rules will be added with round materialization and standings.
