# Competition Profile

`drawDefinition.competitionProfile` is a first-class, versioned configuration attribute. It describes the competition format; matchUps, scores and applied-round provenance live separately. It is separate from `competitionFormat`, which describes how a sport is played.

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

The governing scoring policy permits variants; the selected variant is saved in the profile and each applied round. Individual admission and round application use the APIs below. Manual/live scoring and individual standings use the historical contracts saved with applied rounds.

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
selection. Applied rounds capture the resolved rules used by manual/live scoring and individual standings. Timed scoring requires the explicit enablement below.

## Persisting the scoring choice

Call `setRotatingPartnerScoring({ drawId, selectedVariant? })` before generating matchUps. Omitting
`selectedVariant` saves the approved policy default. The mutation stores the choice in
`competitionProfile.scoring.selectedVariant`; point total and selected variant together define the
resolved combined-point contract. Timed minutes and the selected timed variant define a timed contract. Direct profile writes validate these choices against the governing scoring and tally policies.

`getRotatingPartnerScoringContract({ drawId })` reads that saved contract without consulting current
policies. It refuses an unconfigured profile. This is the query historical scoring must use; the
policy query remains the preview of current governing rules. Changing inherited policies cannot
rewrite the saved contract. Repeating an identical write succeeds without effect; changing or removing
the profile is refused once any matchUps exist. The new mutation also respects DRAWS locks.

The draw-level match contract is captured in each applied round. Mixed scoring between rounds, session conclusion and timed deciding-point exclusion are separate deliveries.

## Timed rounds

Timed scoring stays on profile `version: 1`. Set `scoring: { kind: 'TIMED', minutes: 15 }` and save
an approved variant with `setRotatingPartnerScoring`. Minutes must be positive safe integers.
`ALLOW` maps to `SET1-S:T15P`; `DECIDING_POINT` maps to `SET1-S:T15P/TB1`. Timed `WIN_BY_MARGIN`,
mixed duration/combined-total fields and timed winning margins are refused.

A scoring policy must explicitly enable `timed` for the format. An omitted timed section disables
it, including under the engine default. `timed.permittedMinutes` restricts durations when supplied;
once explicitly enabled, omission permits any positive safe-integer minutes. Whole-policy inheritance
and singleton variant locks apply. A known single structure contributes its inherited timed rules
at selection; generation revalidates the selected structure's scoring and tally policies.

Here is a complete factory example, using an imported `tournamentEngine`:

```typescript
const playerIds = ['a', 'b', 'c', 'd'];
tournamentEngine.setState({
  tournamentId: 'timed-example',
  participants: playerIds.map((participantId) => ({
    participantId,
    participantType: 'INDIVIDUAL' as const,
    participantRole: 'COMPETITOR' as const,
  })),
  events: [
    {
      eventId: 'timed-event',
      eventType: 'DOUBLES',
      entries: playerIds.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' as const })),
      drawDefinitions: [
        {
          drawId: 'timed-draw',
          drawType: 'AD_HOC',
          matchUpType: 'DOUBLES',
          entries: playerIds.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' as const })),
          structures: [{ structureId: 'timed-court', matchUps: [] }],
        },
      ],
    },
  ],
});
tournamentEngine.attachPolicies({
  policyDefinitions: {
    scoring: {
      rotatingPartners: {
        AMERICANO: {
          defaultVariant: { tieResolution: 'ALLOW' },
          permittedVariants: [{ tieResolution: 'ALLOW' }],
          timed: {
            defaultVariant: { tieResolution: 'ALLOW' },
            permittedVariants: [{ tieResolution: 'ALLOW' }, { tieResolution: 'DECIDING_POINT' }],
            permittedMinutes: [15, 20],
          },
        },
      },
    },
  },
});
const configured = tournamentEngine.setCompetitionProfile({
  drawId: 'timed-draw',
  competitionProfile: {
    version: 1,
    format: 'AMERICANO',
    entrantScope: 'INDIVIDUAL',
    matchUpType: 'DOUBLES',
    scoring: { kind: 'TIMED', minutes: 15 },
    standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
    pairing: { seed: 42, algorithmVersion: 1 },
    completion: { kind: 'PARTNERSHIP_COVERAGE' },
  },
});
if (!configured.success) throw new Error('Timed profile refused');
tournamentEngine.setRotatingPartnerScoring({ drawId: 'timed-draw' });
const timedPreview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'timed-draw', roundNumber: 1 });
if (timedPreview.error) throw new Error('Timed preview refused');
const timedRound = tournamentEngine.generateRotatingPartnerRound({
  drawId: 'timed-draw',
  roundNumber: 1,
  requestId: 'timed-round-1',
  expectedPairings: timedPreview.round!,
  expectedScoringContract: timedPreview.scoringContract!,
});
if (timedRound.error) throw new Error('Timed application refused');
const timedResult = tournamentEngine.setMatchUpStatus({
  drawId: 'timed-draw',
  matchUpId: timedRound.matchUps![0].matchUpId,
  outcome: {
    matchUpStatus: 'COMPLETED',
    winningSide: 1,
    score: { sets: [{ setNumber: 1, side1Score: 11, side2Score: 8, winningSide: 1 }] },
  },
});
if (timedResult.error) throw new Error('Timed result refused');
const timedStandings = tournamentEngine.getRotatingPartnerStandings({ drawId: 'timed-draw' });
// Both partners receive their side's actual points: 11, 11, 8, 8.
```

For Mexicano, retain the existing Mexicano pairing/completion fields and enable its own timed policy.
Every previous result must be resolved before generating the next round. Pairing algorithms and
individual ranking remain unchanged.

Scores alone do not complete a timed match. Send an explicit `COMPLETED` outcome, or the scorer's
completed state after ending the segment. A live 11–8 stays live; tied ALLOW finishes without a
winner. Completed 0–0 and tied DECIDING_POINT results are refused atomically. A deciding rally must
be included in the final totals: both manual 11–10 and a scorer-produced 10–10 plus one rally credit
11 and 10. A one-point margin alone does not identify a deciding rally. No countdown, elapsed-time
enforcement or automatic completion scheduler is provided.

All actual rally points count. Timed DECIDING_POINT with tally `decidingPoints: 'EXCLUDE'` is refused
at selection and generation until decided-result evidence supports exclusion. `overtimePoints`
remains required but has no effect for timed scoring, which has no overtime phase. Existing exit
status treatments, settlements, corrections, locks and historical Mexicano snapshots still apply.

Applied rounds and exact retries use saved contracts, even after policy changes. New rounds use
current policy. Legacy combined-point profiles and contracts may omit `kind` or explicitly name
`COMBINED_POINTS`; these compare equally without rewriting historical JSON. Changing saved minutes,
formats or incompatible contracts is refused.

The format code owns the duration: these timed rounds report 15 minutes by default, including `/TB1`.
Use scheduling `averageTimes` keyed by the code for venue allowances. Scoring stays fixed for the draw.
Consumer score entry, server rollout and TMX creation require their separate compatible deliveries;
this factory API example does not provide those integrations.

## Individual entrants and partnership sides

For a configured Americano or Mexicano draw, pass `drawId` to `addEventEntries` to enter individual
competitors into its doubles event as `UNGROUPED` (or explicitly `UNPAIRED`) and into the rotating
draw with an accepted status. `DIRECT_ACCEPTANCE` belongs only to the rotating draw, never the doubles
event. Standard doubles entry behavior remains unchanged
when no rotating draw is targeted. Gender/category checks remain in force. An invalid mixed batch is
refused before event or draw entry writes; PAIRs, unknown IDs and non-competitor roles are refused.
`checkValidEntries` recognizes the individual roster only in the targeted rotating draw. Event
validation uses the existing ungrouped-status convention. Ordinary draws cannot accept these
individuals as doubles competitors; existing loose, ungrouped AD_HOC entries remain supported.
Deleting the rotating draw retains valid ungrouped event entries. Remove its individual draw entries
before removing its competitionProfile.

Match sides remain PAIR participants. `addAdHocMatchUps` accepts partnerships outside the draw entry
list when each has two distinct individual entrants. It requires positive logical round numbers and
refuses any individual appearing twice within a round, including matchUps already inserted. Repeating
people across different rounds is permitted. These insertion guards also apply to the atomic round API below.

## Preview and apply a round

```js
const preview = tournamentEngine.getRotatingPartnerRoundPreview({
  drawId,
  structureId, // optional when the draw has exactly one structure
  roundNumber: 1,
});
if (!preview.error) {
  const result = tournamentEngine.generateRotatingPartnerRound({
    drawId,
    structureId: preview.structureId,
    roundNumber: 1,
    requestId, // unique application identifier; retain for retries
    expectedPairings: preview.round,
    expectedScoringContract: preview.scoringContract,
  });
}
```

Preview creates no participants or matchUps. Application recomputes the preview, refuses changed approved pairings or scoring rules and stages PAIR creation and match insertion before committing. Existing partnerships are reused;
new participants and matchUps have IDs derived from the draw, request and round for server/client replay.
Successful retries with the same request return the stored round without additional writes. Changed
request arguments, removed matches or edited PAIR membership are refused.

Applied provenance lives in `drawDefinition.competitionRounds`, separate from configuration. Each round record
captures side memberships, matchUp IDs, algorithm version, base/round seeds and scoring/tally contracts.
The frozen roster is stored once in `drawDefinition.competitionRoster`; Mexicano records also capture
the source standings snapshot and round cutoff. No freshness token is persisted. Do not edit PAIR memberships after application.

Americano supports sequential application of its complete saved rotation. Mexicano starts from zero
points and uses authoritative individual standings for subsequent rounds. Every prior result must be
settled under its saved tally contract before the next Mexicano round can be previewed.
The roster must stay fixed after application. The round API honours DRAWS locks and participant locks
when adding PAIRs. Court allocation uses existing scheduling methods. Each matchUp carries a fixed-total or timed `matchUpFormat` derived from its saved round scoring contract.
Applied round formats cannot be changed through matchUp, structure, draw or event scope. Scheduling
edits and unrelated PAIR additions do not invalidate approved pairings.

Individual standings and tally policies are documented in [Rotating Partner Pairing](./rotating-partner-pairing.md#individual-standings-and-later-rounds).
