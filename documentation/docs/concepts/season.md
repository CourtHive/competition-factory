# Seasons

## Overview

A **season** declares how competitions that recur fit together across tournament records: a box league re-run every
month, a ladder reset each year, a tiered team league with playoffs and championships, a college dual season.

CODES models this with two documents:

- **`Series`**: the competition that recurs ("Adult 18 & Over", "Tuesday Box League").
- **`Season`**: one edition of a series. It declares its **tiers** (levels, flights, boxes), its **periods** (regular
  season, playoff, championship) and which competitions realise each period.

A season **references** competitions and never contains them. The factory defines and validates these documents and
answers questions about them with pure functions; it stores nothing. Whichever service declares a season stores it.

## Record grain

A `CompetitionRef` narrows to an event or a draw, so both common shapes are expressible:

- **One record per local league season** (the default for leagues CourtHive runs): the record's events are the levels
  and each event's draws are the sub-flights. One reference per level points at `{ tournamentId, eventId }`.
- **One record per division** (as ingested from federations that publish that way): one reference per record.

## Types

```typescript
type Season = {
  seasonId: string;
  seriesId: string;
  precedingSeasonId?: string; // the previous edition: movement and carry-over travel along this edge
  name: string;
  startDate: string;
  endDate?: string;
  status: 'DECLARED' | 'ACTIVE' | 'CLOSED' | 'ABANDONED';
  tiers: SeasonTier[];
  periods: SeasonPeriod[]; // ordered by periodNumber
  advancements?: SeasonAdvancement[];
};

type SeasonTier = { tierId: string; tier: TierClassification; parentTierId?: string; name?: string };

type SeasonPeriod = {
  periodId: string;
  periodNumber: number;
  phase?: string; // 'REGULAR' | 'PLAYOFF' | 'CHAMPIONSHIP' | ...
  includeInStandings: boolean;
  placements?: { tierId: string; subjects: SeasonSubject[] }[]; // who plays in which tier
  competitions: CompetitionRef[];
};

type CompetitionRef = { tierId: string; tournamentId: string; eventId?: string; drawId?: string };
type SeasonSubject = { subjectType: 'PERSON' | 'TEAM'; subjectId: string };
```

`SeasonTier.tier` is a [TierClassification](./tournament-tier), so movement between seasons is answered by
`getTierMovement`. Tiers may nest through `parentTierId` (sub-flights within a flight).

## Advancement

Advancement moves subjects **within** a season: the local league winner to the area playoff, the area winner to the
sectional championship. It is distinct from promotion and relegation **between** seasons. Because the number of steps
differs from one area to another, each advancement is declared on its own:

```js
advancements: [
  {
    advancementId: 'local-to-area',
    fromPeriodId: 'regular',
    fromTierId: 'level-3.5',
    // a fixed number of berths...
    rule: { type: 'TOP_N', n: 1 },
    // ...or berths that scale with the tier's size: 1 below 30 teams, 2 from 30, 3 from 45
    // rule: { type: 'BERTHS_BY_SIZE', berths: [{ minSubjects: 0, n: 1 }, { minSubjects: 30, n: 2 }, { minSubjects: 45, n: 3 }] },
    to: { periodId: 'area-playoff', tierId: 'level-3.5' },
  },
];
```

## seasonGovernor

### validateSeason

Structural validation. Every problem is reported, not only the first.

```js
const { valid, error, context } = seasonGovernor.validateSeason({ season });
// context.errors: ['duplicate tierId: A1', 'tier B1 is its own ancestor', ...]
```

It cannot check that a reference resolves to a record that exists; the factory holds no store.

### getSeasonStandings

Standings per tier, derived from the results of the competitions the season's periods reference. The caller supplies
**in-context matchUps** it has already selected; the factory never loads records.

```js
const { standings, provisional, unanswered, unmapped, unplaced } = seasonGovernor.getSeasonStandings({
  season,
  matchUps, // in-context matchUps from every referenced record
  periodId, // optional: one period; otherwise every period with includeInStandings
  tierId, // optional
  getSubjectId, // optional: participant => durable subject id
  orderBy, // optional: rank flat by these tally fields, higher first, even when a policy is declared
});
// standings: { [tierId]: [{ subject, participantIds, rank, matchUpsWon, matchUpsLost, valueWon, valueLost, ... }] }
```

- `valueWon` / `valueLost` sum the tie score of TEAM matchUps (lines, points or games won), whether the tie was
  derived from its lines or reported as an aggregate.
- By default a TEAM is identified by its `participantId` and an individual by `person.personId`. A pair, or a team
  whose participantId is not stable across records, needs `getSubjectId`.
- **Ordering.** A season, or a tier, may declare a `tallyPolicy`: the same round-robin tally policy a group uses (primary
  measure, tie-break directives, head-to-head), applied by the standings engine. A tier's policy overrides the
  season's. Head-to-head reaches across periods and records, because every result is counted against the durable
  subject rather than the record-scoped participantId. A policy may rank by `valueWon` / `valueLost` as well as the
  round-robin measures. Without a policy, or when `orderBy` is passed, tables rank flat by `orderBy` (default: matchUps
  won, value, sets, games), and subjects level on every field share a rank (1, 2, 2, 4).
- A placed subject who has not played yet follows every subject who has, sharing that place.
- `provisional[tierId]` is true while any referenced matchUp in the tier has no result.
- **Nothing is dropped silently:** a reference no matchUp answered is returned in `unanswered`, a participant with no
  resolvable identity in `unmapped`, and a subject playing outside its period's placements in `unplaced`. An unmapped
  opponent's result still counts for the subject who played them.

### getSeasonAdvancement

Applies each declared advancement to its from-period's standings.

```js
const { outcomes } = seasonGovernor.getSeasonAdvancement({ season, matchUps });
// outcomes: [{ advancement, berths, advancing: SeasonSubject[], tiedAtCut?: SeasonSubject[] }]
```

When subjects are level on rank across the cut, it does not choose between them: those clear of the tie are in
`advancing` and the tied subjects are in `tiedAtCut`, for the season's tie-break rules to decide.

## Movement between periods and seasons

Promotion and relegation are declared before play as `movementRules` and applied at the close of a period. A rule
without `tierId` is the default; a rule naming a tier overrides it for that tier.

```js
movementRules: [
  { promote: 1, relegate: 1 }, // every box: the winner goes up, the last goes down
  { tierId: 'box-1', relegate: 2 }, // the top box sends two down
];
```

Movement happens between **sibling** tiers (tiers sharing a `parentTierId`, or all top-level tiers), ordered by
`tier.numericRank`, lower being more prestigious. The top tier never promotes and the bottom tier never relegates.

### getSeasonMovement

```js
const { proposals, tiedAtCut } = seasonGovernor.getSeasonMovement({ season, periodId, matchUps });
// proposals: [{ subject, fromTierId, toTierId, movement: 'PROMOTED' | 'RELEGATED' | 'HELD', rank }]
// tiedAtCut: [{ tierId, cut: 'PROMOTE' | 'RELEGATE', placesAtCut, subjects }]
```

Every subject in a tier's standings gets a proposal, `HELD` included, labelled by `getTierMovement`. Subjects level
on rank across a cut get no proposal: they are returned in `tiedAtCut`, with the number of places the cut has for
them (`placesAtCut`), for the season's tie-break rules or an operator to decide.

### planNextPeriod

```js
const { nextPeriodId, placements, revisions } = seasonGovernor.planNextPeriod({
  season,
  periodId,
  movements: proposals,
  tiedAtCut,
  overrides: [
    { subject, toTierId: 'box-2', reason: 'won the playoff for the last place', by: 'league admin' },
    { subject: leaving, reason: 'left the league' }, // no toTierId: withdrawn
  ],
});
```

Turns accepted movement into the next period's `placements`, returned rather than written into the season.
`nextPeriodId` is absent when the season has no later period, in which case the placements open the next season.

- An override replaces a proposal, settles a tie, or places an entrant; the last override given for a subject wins.
- Every override that departs from a proposal, settles a tie or withdraws a subject is returned in `revisions`, with
  the proposed tier and a `getTierMovement` label, so a decision that departs from the declared rule stays visible.
- A tied subject with no override is an error (`context.unsettled`), never a guess.

## mocksEngine.generateSeason

A season of team leagues for tests and demos: one record per period, one TEAM event per tier, and the `Season`
document that references them. Teams keep their participantIds across periods (`<tierId>-team-<n>`).

```js
const { season, tournamentRecords } = mocksEngine.generateSeason({
  seasonProfile: {
    tiers: [
      { tierId: 'A1', tierValue: 'A-1', teamsCount: 4 },
      { tierId: 'B1', tierValue: 'B-1', teamsCount: 6 },
    ],
    periods: [{}, { includeInStandings: false }],
  },
});
```
