---
title: Report Governor
---

```js
import { reportGovernor } from 'tods-competition-factory';
```

The **reportGovernor** provides analytics and reporting functions that generate statistical summaries of tournaments, participants, structures, and venues. These methods are useful for dashboards, analytics pages, and tournament management reports.

---

## getParticipantStats

Generates comprehensive statistics for team participants, including match outcomes, competitive profiles, and win/loss ratios across various scoring dimensions (sets, games, points, tiebreaks).

**Purpose:** Analyze team performance with detailed win/loss statistics and competitive metrics. Particularly useful for team events to understand performance patterns and competitive balance.

**When to Use:**

- Building team statistics dashboards
- Analyzing team performance across tournaments
- Comparing head-to-head team records
- Generating post-tournament analytics reports
- Evaluating competitive balance in team competitions

**Parameters:**

```ts
{
  tournamentRecord: Tournament;           // Required tournament record
  matchUps?: HydratedMatchUp[];          // Optional - filter to specific matchUps
  teamParticipantId?: string;            // Optional - focus on specific team
  opponentParticipantId?: string;        // Optional - head-to-head comparison
  withIndividualStats?: boolean;         // Include individual player stats within teams
  withCompetitiveProfiles?: boolean;     // Include competitive profile analysis
  withScaleValues?: boolean;             // Include rating/ranking scale values
  tallyPolicy?: any;                     // Custom tally calculation policy
}
```

**Returns:**

```ts
{
  success: boolean;
  relevantMatchUps: HydratedMatchUp[];   // MatchUps analyzed
  participatingTeamsCount?: number;      // Total teams in analysis
  teamStats?: StatCounters;              // Stats for specified team
  opponentStats?: StatCounters;          // Stats for specified opponent
  allParticipantStats?: StatCounters[];  // Stats for all participants
}

// StatCounters structure
type StatCounters = {
  participantId: string;
  participantName: string;
  competitorIds: string[];               // IDs of competitors in team
  
  // Win/loss/draw tallies at different levels
  matchUps: { won: number; lost: number; played: number };
  sets: { won: number; lost: number; played: number };
  games: { won: number; lost: number; played: number };
  points: { won: number; lost: number; played: number };
  tiebreaks: { won: number; lost: number; played: number };
  
  // Ratios (won/played)
  matchUpsRatio?: number;                // Match win percentage
  setsRatio?: number;                    // Set win percentage
  gamesRatio?: number;                   // Game win percentage
  pointsRatio?: number;                  // Point win percentage
  tiebreaksRatio?: number;               // Tiebreak win percentage
  
  // Competitive profile
  competitiveness?: {
    decisive: Tally;                     // Dominant wins/losses
    routine: Tally;                      // Normal competitive matches
    competitive: Tally;                  // Very close matches
  };
  competitiveRatio?: number;             // % of competitive matches
  decisiveRatio?: number;                // % of decisive matches
  routineRatio?: number;                 // % of routine matches
  
  // Match status breakdown
  matchUpStatuses: { [status: string]: number }; // Count by status
  
  // Rankings (if multiple participants)
  matchUpsRank?: number;
  setsRank?: number;
  gamesRank?: number;
  pointsRank?: number;
  tiebreaksRank?: number;
};
```

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

// Get statistics for all teams
const result = tournamentEngine.getParticipantStats({
  withScaleValues: true,
});

console.log(result.participatingTeamsCount); // 8
console.log(result.allParticipantStats.length); // 8
result.allParticipantStats.forEach(stats => {
  console.log(`${stats.participantName}: ${stats.matchUps.won}W-${stats.matchUps.lost}L`);
  console.log(`  Match Win %: ${(stats.matchUpsRatio * 100).toFixed(1)}%`);
  console.log(`  Sets: ${stats.sets.won}W-${stats.sets.lost}L`);
  console.log(`  Games: ${stats.games.won}W-${stats.games.lost}L`);
});

// Get statistics for specific team
const result = tournamentEngine.getParticipantStats({
  teamParticipantId: 'team-1',
  withIndividualStats: true,
});

console.log(result.teamStats.participantName);
console.log(result.teamStats.matchUps); // { won: 5, lost: 2, played: 7 }
console.log(result.teamStats.competitiveness);
// {
//   decisive: { won: 2, lost: 1, played: 3 },
//   routine: { won: 2, lost: 1, played: 3 },
//   competitive: { won: 1, lost: 0, played: 1 }
// }

// Head-to-head comparison
const result = tournamentEngine.getParticipantStats({
  teamParticipantId: 'team-1',
  opponentParticipantId: 'team-2',
});

console.log(result.allParticipantStats.length); // 2
console.log(result.teamStats); // Stats for team-1
console.log(result.opponentStats); // Stats for team-2
console.log(result.relevantMatchUps); // Only matchUps between these teams

// Filter to specific matchUps
const teamMatchUps = tournamentEngine.allTournamentMatchUps({
  matchUpFilters: { matchUpTypes: ['TEAM'] },
}).matchUps;

const result = tournamentEngine.getParticipantStats({
  matchUps: teamMatchUps.slice(0, 5), // First 5 team matchUps only
});
```

**Notes:**

- Primarily designed for team events (TEAM_MATCHUP types)
- Automatically filters to TEAM_PARTICIPANT types if no specific IDs provided
- Competitive profiles categorize matches as decisive, routine, or competitive based on score patterns
- Ratios are calculated as won/played (0.0 to 1.0)
- Rankings are calculated when analyzing multiple participants
- Individual stats include player-level statistics within team matchUps
- Requires completed matchUps with scores for accurate statistics
- Returns error if no matchUps are provided or available

---

## getEntryStatusReports

Generates detailed reports about participant entry statuses across all events and draws in a tournament. Shows how participants entered draws (direct acceptance, qualifying, wildcard, etc.) and their current status.

**Purpose:** Track participant entries, withdrawals, and seeding across all tournament events and draws. Essential for tournament administration and entry list management.

**When to Use:**

- Generating entry list reports for tournament staff
- Tracking wildcards, qualifiers, and direct acceptances
- Monitoring withdrawals and their impact
- Auditing draw composition and entry methods
- Analyzing seeding distribution across stages
- Reporting on WTN/UTR ratings at entry time

**Parameters:**

```ts
{
  tournamentRecord: Tournament;  // Required tournament record
}
```

**Returns:**

```ts
{
  eventReports: {
    [eventId: string]: {
      eventId: string;
      eventType: string;
      eventName: string;
      drawsCount: number;
      entryStatuses: {                    // Count and percentage by status
        [status: string]: {
          count: number;
          pct: number;                    // Percentage of total entries
        };
      };
      structureSelectedCount: number;     // Participants placed in draws
      totalEntriesCount: number;          // Total entries for event
    };
  };
  
  participantReports: {
    [participantId: string]: Array<{
      participantId: string;
      participantName?: string;
      participantType: string;
      tournamentId: string;
      eventId: string;
      eventType: string;
      drawId: string;
      entryStatus: string;                // e.g., DIRECT_ACCEPTANCE, QUALIFIER, WILDCARD
      entryStage: string;                 // MAIN or QUALIFYING
      mainSeeding?: number;               // Seed number in main draw
      qualifyingSeeding?: number;         // Seed number in qualifying
      ranking?: any;                      // Event-specific ranking
      singlesWTN?: number;                // WTN rating for singles
      doublesWTN?: number;                // WTN rating for doubles
      confidence?: string;                // WTN confidence level
    }>;
  };
  
  entryStatusReports: {
    [eventId: string]: {
      [drawId: string]: {
        [entryStatus: string]: Array<{
          participantId: string;
          participantName?: string;
          // ... (same fields as participantReports)
        }>;
      };
    };
  };
  
  withdrewCount: number;                  // Total withdrawn participants
  tournamentId: string;
}
```

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

const reports = tournamentEngine.getEntryStatusReports();

// Event-level summary
Object.values(reports.eventReports).forEach(eventReport => {
  console.log(`${eventReport.eventName}:`);
  console.log(`  Total Entries: ${eventReport.totalEntriesCount}`);
  console.log(`  In Draws: ${eventReport.structureSelectedCount}`);
  console.log(`  Entry Status Breakdown:`);
  
  Object.entries(eventReport.entryStatuses).forEach(([status, stats]) => {
    console.log(`    ${status}: ${stats.count} (${stats.pct}%)`);
  });
});

// Output:
// Men's Singles:
//   Total Entries: 96
//   In Draws: 96
//   Entry Status Breakdown:
//     DIRECT_ACCEPTANCE: 64 (66.7%)
//     QUALIFIER: 16 (16.7%)
//     WILDCARD: 8 (8.3%)
//     LUCKY_LOSER: 4 (4.2%)
//     WITHDRAWN: 4 (4.2%)

// Participant-level detail
const participantId = 'participant-1';
const participantEntries = reports.participantReports[participantId];

participantEntries.forEach(entry => {
  console.log(`Event: ${entry.eventType}`);
  console.log(`  Entry Status: ${entry.entryStatus}`);
  console.log(`  Stage: ${entry.entryStage}`);
  console.log(`  Seeding: ${entry.mainSeeding || 'Unseeded'}`);
  console.log(`  WTN: ${entry.singlesWTN || 'N/A'}`);
});

// Entry status by event and draw
const eventId = 'event-1';
const drawId = 'draw-1';
const wildcards = reports.entryStatusReports[eventId]?.[drawId]?.WILDCARD;

console.log(`Wildcards in draw: ${wildcards?.length || 0}`);
wildcards?.forEach(wc => {
  console.log(`  ${wc.participantName} (Seed: ${wc.mainSeeding || 'N/A'})`);
});

// Check withdrawal impact
console.log(`Total withdrawals across tournament: ${reports.withdrewCount}`);
```

**Notes:**

- Only includes participants who were actually placed in draws (non-team events)
- Entry statuses include: DIRECT_ACCEPTANCE, QUALIFIER, WILDCARD, LUCKY_LOSER, ALTERNATE, WITHDRAWN, etc.
- WTN (World Tennis Number) values included if available on participants
- Seeding reported separately for main draw and qualifying
- Percentages calculated per event based on total entries
- Withdrawn participants tracked separately
- Includes event rankings if available
- Confidence levels (LOW, MEDIUM, HIGH) for WTN ratings when present

---

## getStructureReports

Generates comprehensive reports about draw structures including size, format, participant details, seeding basis, and draw manipulations (e.g., position replacements, withdrawals).

**Purpose:** Analyze draw structures for tournament reporting, auditing, and administration. Provides detailed breakdowns of each draw structure including participant composition, seeding, and any manual interventions.

**When to Use:**

- Generating tournament summary reports
- Auditing draw integrity and manipulations
- Analyzing seeding basis and methodology
- Tracking flight assignments in multi-flight events
- Reporting on draw composition by rating bands
- Documenting structure-level extensions and metadata
- Monitoring draw deletions and regenerations

**Parameters:**

```ts
{
  tournamentRecord: Tournament;           // Required tournament record
  extensionProfiles?: Array<{             // Optional custom extension extraction
    name: string;                         // Extension name
    label?: string;                       // Display label
    accessor?: string;                    // Path to nested value
  }>;
  firstFlightOnly?: boolean;              // Only report first flight in multi-flight events
  firstStageSequenceOnly?: boolean;       // Only report first stage sequence (default: true)
}
```

**Returns:**

```ts
{
  eventStructureReports: {
    [eventId: string]: {
      eventId: string;
      tournamentId: string;
      seedingBasis?: string;              // JSON representation of seeding methodology
      generatedDrawsCount: number;        // Number of draws generated
      drawDeletionsCount: number;         // Number of times draws were deleted
      totalPositionManipulations: number; // Sum of all manual interventions
      maxPositionManipulations: number;   // Highest manipulation count in any structure
    };
  };
  
  structureReports: Array<{
    // Structure identification
    structureId: string;
    drawId: string;
    eventId: string;
    tournamentId: string;
    
    // Event details
    eventName: string;
    eventType: string;                    // SINGLES, DOUBLES, TEAM
    category?: {
      ageCategoryCode: string;
      categoryName: string;
    };
    
    // Flight information (if applicable)
    flightNumber?: number;
    
    // Structure details
    structureName: string;                // e.g., "Main Draw", "Qualifying"
    structureType: string;                // SINGLE_ELIMINATION, ROUND_ROBIN, etc.
    stage: string;                        // MAIN, QUALIFYING, CONSOLATION, PLAY_OFF
    stageSequence: number;
    finishingPositionRange: {           // see Finishing Positions concept
      winner: number;
      loser: number;
    };

    // Size and participant info
    structureSize: number;                // Number of draw positions
    participantsCount: number;            // Actual participants assigned
    positionsAssigned: number;            // Positions filled (including BYEs)
    averageWTN?: number;                  // Average WTN rating of participants
    avgRating?: number;                   // Average rating (generic)
    
    // Seeding
    seedsCount: number;                   // Number of seeded positions
    seedingBasis?: string;                // Seeding methodology
    
    // Match format
    matchUpFormat: string;                // e.g., "SET3-S:6/TB7"
    matchUpFormatDesc?: string;           // Human-readable format description
    collectionDefinitions?: Array<{       // For team events
      collectionId: string;
      matchUpFormat: string;
      matchUpType: string;
      matchUpValue?: number;
    }>;
    tieFormatDescription?: string;        // Description of team format
    
    // Manipulations and auditing
    positionManipulations: number;        // Count of manual interventions
    manipulations?: string[];             // Details: ["LUCKY_LOSER: 5", "WITHDRAW_PARTICIPANT: 12/14"]
    
    // Participant details
    participants: Array<{
      participantId: string;
      participantName?: string;
      participantType: string;
      seeding?: {
        seedNumber: number;
        seedValue: string;
      };
      wtn?: number;                       // WTN rating
      draw Position?: number;              // Assigned position
    }>;
    
    // Custom extensions (if extensionProfiles provided)
    [extensionLabel: string]: any;
  }>;
  
  // Flight summary (for multi-flight events)
  flightReports: Array<{
    drawId: string;
    eventId: string;
    eventName: string;
    flightNumber: number;
    stage: string;
    structureName: string;
  }>;
}
```

**Examples:**

```js
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.setState(tournamentRecord);

// Basic structure report
const reports = tournamentEngine.getStructureReports();

// Event-level summary
Object.values(reports.eventStructureReports).forEach(eventReport => {
  console.log(`Event: ${eventReport.eventId}`);
  console.log(`  Generated Draws: ${eventReport.generatedDrawsCount}`);
  console.log(`  Total Manipulations: ${eventReport.totalPositionManipulations}`);
  console.log(`  Draw Deletions: ${eventReport.drawDeletionsCount}`);
});

// Structure-level details
reports.structureReports.forEach(structure => {
  console.log(`${structure.eventName} - ${structure.structureName}:`);
  console.log(`  Structure Type: ${structure.structureType}`);
  console.log(`  Size: ${structure.structureSize}`);
  console.log(`  Participants: ${structure.participantsCount}`);
  console.log(`  Seeds: ${structure.seedsCount}`);
  console.log(`  Avg WTN: ${structure.averageWTN?.toFixed(2) || 'N/A'}`);
  console.log(`  Format: ${structure.matchUpFormat}`);
  
  if (structure.positionManipulations > 0) {
    console.log(`  Manipulations: ${structure.positionManipulations}`);
    structure.manipulations?.forEach(m => console.log(`    - ${m}`));
  }
});

// Output example:
// Men's Singles - Main Draw:
//   Structure Type: SINGLE_ELIMINATION
//   Size: 32
//   Participants: 32
//   Seeds: 8
//   Avg WTN: 12.5
//   Format: SET3-S:6/TB7
//   Manipulations: 2
//     - LUCKY_LOSER: 17
//     - WITHDRAW_PARTICIPANT: 5

// With custom extension extraction
const reports = tournamentEngine.getStructureReports({
  extensionProfiles: [
    { name: 'customMetadata', label: 'metadata', accessor: 'some.nested.path' },
    { name: 'drawProfile', label: 'profile' }
  ]
});

reports.structureReports.forEach(structure => {
  console.log(structure.metadata); // Custom extension data
  console.log(structure.profile);  // Another extension
});

// Filter to main structures only
const reports = tournamentEngine.getStructureReports({
  firstStageSequenceOnly: true, // default behavior
});

// Include all stages (consolations, playoffs, etc.)
const reports = tournamentEngine.getStructureReports({
  firstStageSequenceOnly: false,
});

// Multi-flight event reporting
const reports = tournamentEngine.getStructureReports({
  firstFlightOnly: true,
});

reports.flightReports.forEach(flight => {
  console.log(`Flight ${flight.flightNumber}: ${flight.eventName} - ${flight.structureName}`);
});
```

**Notes:**

- `firstStageSequenceOnly: true` (default) excludes consolation and playoff structures
- Flight numbers extracted from FLIGHT_PROFILE extension if present
- Seeding basis tracked from ADD_SCALE_ITEMS timeItems
- Position manipulations include: withdrawals, alternates, lucky losers, seeding changes
- WTN ratings averaged across participants when available
- Tie format descriptions generated for team events with collection definitions
- Structure size may differ from participants count (due to BYEs or unfilled positions)
- Finishing position ranges indicate placement (e.g., winner: 1, loser: 2 for finals)
- Custom extensions can be extracted using extensionProfiles accessor patterns
- Reports include only structures that have been generated (excludes planned but not created)

---

## getVenuesReport

Generates utilization reports for venues showing court availability, scheduled matchUps, and percentage utilization across specified dates.

**Purpose:** Analyze venue and court utilization to optimize scheduling, identify capacity issues, and report on facility usage across tournament dates.

**When to Use:**

- Monitoring real-time venue utilization during scheduling
- Generating post-tournament facility usage reports
- Identifying over/under-utilized venues and dates
- Optimizing schedule distribution across venues
- Planning future tournament capacity requirements
- Reporting to venue management on court usage

**Parameters:**

```ts
{
  tournamentRecords: TournamentRecords;   // Required - can be multiple tournaments
  tournamentId?: string;                  // Optional - filter to specific tournament
  venueIds?: string[];                    // Optional - filter to specific venues
  dates?: string[];                       // Optional - filter to specific dates (YYYY-MM-DD)
  ignoreDisabled?: boolean;               // Exclude disabled courts (default: true)
}
```

**Returns:**

```ts
{
  venuesReport: Array<{
    venueId: string;
    venueName: string;
    venueReport: {
      [date: string]: {                   // One entry per date
        availableCourts: number;          // Courts with availability on this date
        availableMinutes: number;         // Total minutes available across all courts
        scheduledMinutes: number;         // Total minutes with scheduled matchUps
        scheduledMatchUpsCount: number;   // Number of matchUps scheduled
        percentUtilization: string;       // Percentage (scheduledMinutes/availableMinutes)
      };
    };
  }>;
}
```

**Examples:**

```js
import { competitionEngine } from 'tods-competition-factory';

competitionEngine.setState(tournamentRecords);

// Report for all venues across all dates
const result = competitionEngine.getVenuesReport({
  tournamentRecords,
});

result.venuesReport.forEach(venue => {
  console.log(`${venue.venueName}:`);
  
  Object.entries(venue.venueReport).forEach(([date, stats]) => {
    console.log(`  ${date}:`);
    console.log(`    Courts Available: ${stats.availableCourts}`);
    console.log(`    Total Available: ${stats.availableMinutes} minutes`);
    console.log(`    Scheduled: ${stats.scheduledMinutes} minutes (${stats.scheduledMatchUpsCount} matches)`);
    console.log(`    Utilization: ${stats.percentUtilization}%`);
  });
});

// Output:
// National Tennis Center:
//   2026-06-15:
//     Courts Available: 8
//     Total Available: 3840 minutes
//     Scheduled: 2400 minutes (32 matches)
//     Utilization: 62.50%
//   2026-06-16:
//     Courts Available: 8
//     Total Available: 3840 minutes
//     Scheduled: 3600 minutes (48 matches)
//     Utilization: 93.75%

// Filter to specific venue
const result = competitionEngine.getVenuesReport({
  tournamentRecords,
  venueIds: ['venue-1', 'venue-2'],
});

// Filter to specific dates
const result = competitionEngine.getVenuesReport({
  tournamentRecords,
  dates: ['2026-06-15', '2026-06-16'],
});

// Filter to specific tournament
const result = competitionEngine.getVenuesReport({
  tournamentRecords,
  tournamentId: 'tournament-1',
});

// Include disabled courts
const result = competitionEngine.getVenuesReport({
  tournamentRecords,
  ignoreDisabled: false,
});

// Check for over-utilization (>100%)
result.venuesReport.forEach(venue => {
  Object.entries(venue.venueReport).forEach(([date, stats]) => {
    const utilization = parseFloat(stats.percentUtilization);
    if (utilization > 100) {
      console.warn(`⚠️  ${venue.venueName} on ${date}: ${utilization}% utilized (OVER-SCHEDULED)`);
    } else if (utilization > 90) {
      console.warn(`⚠️  ${venue.venueName} on ${date}: ${utilization}% utilized (Near capacity)`);
    }
  });
});

// Find under-utilized venues
result.venuesReport.forEach(venue => {
  Object.entries(venue.venueReport).forEach(([date, stats]) => {
    const utilization = parseFloat(stats.percentUtilization);
    if (utilization < 50 && stats.availableCourts > 0) {
      console.log(`💡 ${venue.venueName} on ${date}: Only ${utilization}% utilized (${stats.availableCourts} courts available)`);
    }
  });
});
```

**Notes:**

- Utilization percentage can exceed 100% if matchUps overlap or run past available time slots
- Available minutes calculated from court dateAvailability timeSlots
- Scheduled minutes calculated using averageMinutes from matchUp schedules
- Recovery times (after matchUp completion) are included in calculations when `afterRecoveryTimes: true`
- Only courts with availability on specified dates are counted in availableCourts
- Disabled courts excluded by default (set `ignoreDisabled: false` to include)
- Supports multi-tournament reporting (competition-level)
- Dates must be in ISO format (YYYY-MM-DD)
- If no dates specified, reports on all dates found in court availability
- If no venueIds specified, reports on all venues with the tournament(s)
- Useful for identifying scheduling bottlenecks and optimization opportunities

---
