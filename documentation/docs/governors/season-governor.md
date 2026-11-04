---
title: Season Governor
---

```js
import { seasonGovernor } from 'tods-competition-factory';
```

The **seasonGovernor** answers questions about a CODES `Season`: whether it is well formed, its standings, who
advances out of a period and who moves between tiers when a period closes. A season references competitions across
tournament records and never contains them, so every method here is **pure**. The caller passes the season and the
**in-context matchUps** it has already selected from the referenced records; the factory loads nothing and stores
nothing. Whichever service declares a season stores it.

For the model itself (`Series`, `Season`, tiers, periods, placements, advancements and movement rules) and worked
examples, see [Seasons](../concepts/season.md). Season tables are ordered by the same standings engine as round-robin
groups: see [Standings](../concepts/standings.md).

Every method returns the usual `{ success }` or `{ error }`, plus the fields listed below.

---

## validateSeason

Structural validation of a `Season`: identities, the tier lattice, the periods and what they reference, placements and
advancements. Every problem is reported, not only the first.

```ts
{
  season: Season;
  checkPolicies?: boolean; // default true: also check the season's and each tier's tally policy
}
```

**Returns:** `{ valid, errors? }`. On an invalid season, `error` is set and `context.errors` lists every problem.

It cannot check that a `CompetitionRef` resolves to a record that exists, since the factory holds no store.
`getSeasonStandings` reports a reference no matchUp answered.

---

## getSeasonStandings

Standings per tier, derived from the results of the competitions the season's periods reference.

```ts
{
  season: Season;
  matchUps: HydratedMatchUp[]; // in-context, from every referenced record
  periodId?: string; // one period; otherwise every period with includeInStandings
  tierId?: string;
  getSubjectId?: (participant) => string | undefined; // participant => durable subject id
  orderBy?: (keyof SeasonStandingsTally)[]; // rank flat by these fields, higher first
  tallyPolicy?: RoundRobinTallyPolicy; // overrides the season's and tiers' policies
  purpose?: string; // STANDINGS_PURPOSE_*: a policy's directives may apply only for some purposes
  externalValues?: Record<string, Record<string, number>>; // read by `external` tally directives
}
```

**Returns:**

- `standings`: tables keyed by `tierId`, ranked.
- `provisional`: keyed by `tierId`, true while any referenced matchUp in the tier has no result.
- `unanswered`: references that no matchUp answered (a missing, unpublished or unselected competition).
- `unmapped`: participants no subject id could be resolved for.
- `unplaced`: subjects who played in a tier the period's placements do not put them in.

Nothing is dropped silently: each of those is reported rather than shrinking a table. By default a TEAM is identified by
its `participantId` and an individual by `person.personId`. A pair, or a team whose `participantId` is not stable across
records, needs `getSubjectId`. See [Seasons → getSeasonStandings](../concepts/season.md#getseasonstandings) for
ordering and tie rules.

---

## getSeasonAdvancement

Who advances out of a period into a later competition of the same season (local league to area playoff, area to
sectionals). Applies each declared advancement to its from-period's standings. It proposes and records nothing; the
caller places the advancing subjects.

```ts
{
  season: Season;
  matchUps: HydratedMatchUp[]; // in-context
  advancementId?: string; // one declared advancement; otherwise every one the season declares
  getSubjectId?: (participant) => string | undefined;
  orderBy?: (keyof SeasonStandingsTally)[];
  tallyPolicy?: RoundRobinTallyPolicy;
}
```

**Returns:** `{ outcomes }`, one per advancement: `{ advancement, berths, advancing, tiedAtCut? }`. `advancing` lists the
subjects who advance, best first. Subjects level on rank across the cut are not chosen between: they are returned in
`tiedAtCut` for the season's tie-break rules to decide.

---

## getSeasonMovement

Who moves up, down or stays at the close of a period, under the season's declared `movementRules`. It proposes and
records nothing.

```ts
{
  season: Season;
  periodId: string; // the period whose close the movement is computed for
  matchUps: HydratedMatchUp[]; // in-context
  getSubjectId?: (participant) => string | undefined;
  orderBy?: (keyof SeasonStandingsTally)[];
  tallyPolicy?: RoundRobinTallyPolicy;
}
```

**Returns:** `{ proposals, tiedAtCut? }`. Every subject in a tier's standings gets a proposal, `HELD` included, except
subjects level on rank across a cut: those are returned in `tiedAtCut` and decided by an operator or the season's rules.

---

## planNextPeriod

Turns accepted movement into the next period's placements. It returns the placements and never writes them into the
season.

```ts
{
  season: Season;
  periodId: string; // the period the movement was computed for
  movements: SeasonMovementProposal[]; // usually getSeasonMovement(...).proposals
  tiedAtCut?: SeasonMovementTie[]; // the ties getSeasonMovement left undecided
  overrides?: SeasonMovementOverride[]; // operator decisions; the last one given for a subject wins
}
```

**Returns:** `{ nextPeriodId?, placements, revisions }`.

- `nextPeriodId`: absent when the next placements open a new season.
- `revisions`: every proposal an override changed and every tie an override settled, so a decision that departs from
  the declared rule stays visible.

A tied subject without an override is an error, not a guess.

---

## Related

- [Seasons](../concepts/season.md): the model, advancement, movement and `mocksEngine.generateSeason`.
- [Standings](../concepts/standings.md): the ordering engine shared with round-robin groups.
