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
const { standings, unanswered, unmapped, unplaced } = seasonGovernor.getSeasonStandings({
  season,
  matchUps, // in-context matchUps from every referenced record
  periodId, // optional: one period; otherwise every period with includeInStandings
  tierId, // optional
  getSubjectId, // optional: participant => durable subject id
  orderBy, // optional: tally fields compared in order, higher first
});
// standings: { [tierId]: [{ subject, participantIds, rank, matchUpsWon, matchUpsLost, valueWon, valueLost, ... }] }
```

- `valueWon` / `valueLost` sum the tie score of TEAM matchUps (lines, points or games won), whether the tie was
  derived from its lines or reported as an aggregate.
- By default a TEAM is identified by its `participantId` and an individual by `person.personId`. A pair, or a team
  whose participantId is not stable across records, needs `getSubjectId`.
- Subjects level on every `orderBy` field share a rank (1, 2, 2, 4).
- **Nothing is dropped silently:** a reference no matchUp answered is returned in `unanswered`, a participant with no
  resolvable identity in `unmapped`, and a subject playing outside its period's placements in `unplaced`.

### getSeasonAdvancement

Applies each declared advancement to its from-period's standings.

```js
const { outcomes } = seasonGovernor.getSeasonAdvancement({ season, matchUps });
// outcomes: [{ advancement, berths, advancing: SeasonSubject[], tiedAtCut?: SeasonSubject[] }]
```

When subjects are level on rank across the cut, it does not choose between them: those clear of the tie are in
`advancing` and the tied subjects are in `tiedAtCut`, for the season's tie-break rules to decide.

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
