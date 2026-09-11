---
title: League Profiles
---

# League Profiles

League profiles enable generation of round-robin team league structures through `mocksEngine.generateTournamentRecord()`. Each league profile creates a TEAM event with generated team participants, individual players sized from the tie format, and an AD_HOC draw definition with the appropriate number of rounds.

## Basic Usage

```js
const { tournamentRecord, eventIds, drawIds, venueIds } = mocksEngine.generateTournamentRecord({
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  leagueProfiles: [
    {
      tieFormatName: COLLEGE_DEFAULT,
      leagueName: 'NTRP 3.5 Men',
      teamsCount: 8,
      gender: MALE,
      automated: true,
    },
  ],
});
```

## League Profile Options

```typescript
interface LeagueProfile {
  // Naming
  leagueName?: string; // Display name (falls back to eventName, then "League N")
  leagueId?: string; // Event ID (falls back to eventId, then auto-generated)
  eventName?: string; // Alias for leagueName
  eventId?: string; // Alias for leagueId

  // Teams
  teamsCount?: number; // Number of teams to generate
  teamProfiles?: TeamProfile[]; // Explicit team definitions (see below)

  // Tie Format
  tieFormat?: TieFormat; // Explicit tie format object
  tieFormatName?: string; // Named format (default: COLLEGE_DEFAULT)

  // Draw Configuration
  roundsCount?: number | 'DOUBLE_ROUND_ROBIN'; // Number of rounds (default: teamsCount - 1)
  automated?: boolean; // Auto-generate draw pairings via DrawMatic
  pairingProfile?: PairingProfile; // Apply a pairing shape instead of DrawMatic (see below)

  // Participant Configuration
  individualParticipants?: boolean; // false generates TEAM participants with NO members (see below)
  category?: Category; // Age/skill category
  gender?: string; // MALE, FEMALE, MIXED, ANY
  startDate?: string; // Override tournament startDate for age calculations
  participantsProfile?: object; // Passed to generateParticipants

  // IDs
  idPrefix?: string; // Prefix for generated participant IDs
}
```

### Team Profile Options

```typescript
interface TeamProfile {
  teamName?: string; // Team display name (default: "Team N")
  teamId?: string; // Team participant ID (auto-generated if omitted)
  venueIds?: string[]; // Home venue IDs (venues auto-generated)
}
```

## Draw Size Resolution

The draw size is determined by `Math.max(teamsCount, teamProfiles.length)`. This means you can specify more teams via `teamsCount` than you define in `teamProfiles` — the extra teams get default names ("Team 4", "Team 5", etc.).

## Rounds Count

- **Default**: `teamsCount - 1` (single round-robin: every team plays every other team once)
- **Explicit**: Set `roundsCount` to any integer
- **Double round-robin**: Set `roundsCount` to `(teamsCount - 1) * 2` or use the `DOUBLE_ROUND_ROBIN` constant

Any `roundsCount` beyond `teamsCount - 1` requires pairings to be replayed, which the default DrawMatic
pairing permits only when told to — league profiles set that flag automatically. A `roundsCount` beyond
`(teamsCount - 1) * 2` is reported as an error rather than silently producing an empty draw.

## Pairing Shape

By default a league is paired by **DrawMatic**, which avoids repeat opponents probabilistically but does not
guarantee that every team meets every other team. Supply a `pairingProfile` to generate a true round robin
schedule instead — determined in full before play, which is what a published league fixture list requires:

```js
mocksEngine.generateTournamentRecord({
  leagueProfiles: [
    {
      leagueName: 'Spring Division 1',
      teamsCount: 8,
      pairingProfile: {
        shape: ROUND_ROBIN, // every team meets every other team
        encounters: 2, // home-and-home
      },
    },
  ],
});
```

With a `pairingProfile`, `roundsCount` becomes an optional **truncation** to a partial round robin rather
than the number of rounds to generate:

```js
{
  teamsCount: 12,
  pairingProfile: { shape: ROUND_ROBIN },
  roundsCount: 4,   // the first 4 rounds of an 11-round schedule
}
```

See [Round Robin Pairing](/docs/concepts/draw-types/round-robin-pairing) for the shape's full semantics —
encounters, side mirroring, odd team counts, and error conditions.

## Team-Only Competitions

Many federations publish the teams and the results but never the players — rosters are not part of the
public data, and inventing placeholder persons would fabricate what the source does not contain. Such a
competition is a **legitimate shape**, not a degraded record: TEAM participants that enumerate no
individuals at all.

```js
mocksEngine.generateTournamentRecord({
  leagueProfiles: [
    {
      leagueName: 'Metro Division 1',
      teamsCount: 8,
      individualParticipants: false, // TEAM participants with no members
      pairingProfile: { shape: ROUND_ROBIN },
      tieFormat: {
        scoreSource: 'REPORTED', // ...and no line detail either
        winCriteria: { valueGoal: 2 },
        collectionDefinitions: [/* still describes what was played */],
      },
    },
  ],
});
```

The generated record contains only TEAM participants: no INDIVIDUAL participants exist, and each team's
`individualParticipantIds` is empty. Draw generation, scoring, standings and the read-model projection all
work from team results alone — the read model claims no `person_id` for anyone, because there is no person.

Combined with [`scoreSource: REPORTED`](/docs/concepts/tieFormat#score-source--derived-vs-reported) this is
the full shape of a federation data lift where neither rosters nor line scores are published.

**Ranking and rating implications.** Ranking is person-scoped, so a team-only record produces no ranking
points for anyone. Competitive standing for these teams is a team-level question (tier and movement between
seasons), not a person-level one.

**Note:** `individualParticipants: false` is currently supported for `leagueProfiles`. Team events generated
through `drawProfiles` still build teams from a tournament-level participant pool and always enumerate
members.

## Tie Format and Team Sizing

The tie format determines the number of individual participants per team. The factory inspects the `collectionDefinitions` in the tie format to calculate the required team roster size based on the maximum singles and doubles positions.

If no `tieFormat` object is provided, the factory resolves one from `tieFormatName` (defaulting to `COLLEGE_DEFAULT`).

## Venue Generation

When `teamProfiles` include `venueIds`, those venue IDs are collected and venues are auto-generated at the end of league processing. This enables home/away scheduling scenarios where each team has an associated venue.

## Multiple Leagues

A single tournament can contain multiple leagues. Each league profile generates its own event, draw, and set of team participants:

```js
mocksEngine.generateTournamentRecord({
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  leagueProfiles: [
    {
      leagueName: 'NTRP 3.5 Men',
      teamsCount: 8,
      gender: MALE,
    },
    {
      leagueName: 'NTRP 3.5 Women',
      teamsCount: 8,
      gender: FEMALE,
    },
    {
      leagueName: 'NTRP 3.0 Mixed',
      teamsCount: 6,
      gender: MIXED,
    },
  ],
});
```

## Complete Example

```js
import { mocksEngine, tournamentEngine } from 'tods-competition-factory';
import { COLLEGE_DEFAULT } from 'tods-competition-factory/constants/tieFormatConstants';
import { MALE } from 'tods-competition-factory/constants/genderConstants';
import { TEAM } from 'tods-competition-factory/constants/participantConstants';

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  setState: true,
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  leagueProfiles: [
    {
      tieFormatName: COLLEGE_DEFAULT,
      leagueName: 'Spring League',
      teamsCount: 8,
      gender: MALE,
      automated: true,
      teamProfiles: [
        { teamName: 'Eagles', venueIds: ['venue-1'] },
        { teamName: 'Hawks', venueIds: ['venue-2'] },
        { teamName: 'Falcons', venueIds: ['venue-3'] },
        { teamName: 'Owls', venueIds: ['venue-4'] },
        { teamName: 'Ravens', venueIds: ['venue-5'] },
        { teamName: 'Sparrows', venueIds: ['venue-6'] },
        { teamName: 'Robins', venueIds: ['venue-7'] },
        { teamName: 'Jays', venueIds: ['venue-8'] },
      ],
    },
  ],
});

// Query the generated structure
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: [TEAM] },
});
console.log(`${participants.length} teams generated`); // 8 teams

const { matchUps } = tournamentEngine.allTournamentMatchUps();
console.log(`${matchUps.length} matchUps generated`);
```
