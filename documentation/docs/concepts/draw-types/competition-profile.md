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

An optional `scoring.tiedResult` can declare `ALLOW` or `SUDDEN_DEATH`. This increment stores configuration only: it does not implement fixed-total scoring, tied completion, individual standings, participant admission or round application. Those capabilities must be implemented before these profiles can drive complete competitions.

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
