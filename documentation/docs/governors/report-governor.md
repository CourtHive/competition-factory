---
title: Report Governor
---

```js
import { reportGovernor } from 'tods-competition-factory';
```

The **reportGovernor** provides analytics and reporting functions that generate statistical summaries of tournaments, participants, structures, and venues. These methods are useful for dashboards, analytics pages, and tournament management reports.

## Unified Reporting API

The reporting engine provides a unified interface for generating reports in a consistent `{ reportId, columns, rows, summary }` shape. This allows consumers to render any report as a table, export to PDF/CSV/JSON, or publish as data without knowing the internal structure of each report.

Three infrastructure methods power the unified API:

- [`getAvailableReports`](#getavailablereports) — discover which reports are computable for a tournament
- [`buildReportContext`](#buildreportcontext) — pre-hydrate shared data for multiple reports
- [`generateReport`](#generatereport) — generate any registered report by ID

The individual report methods ([`getParticipantStats`](#getparticipantstats), [`getEntryStatusReports`](#getentrystatusreports), [`getStructureReports`](#getstructurereports), [`getVenuesReport`](#getvenuesreport)) continue to work as before and return their original shapes. The unified API wraps them.

---

## getAvailableReports

Returns a list of all registered reports with metadata indicating whether each is computable given the current tournament data.

**Parameters:**

```ts
{
  tournamentRecord: Tournament;
}
```

**Returns:**

```ts
{
  availableReports: Array<{
    reportId: string; // Unique report identifier (e.g., 'entries.entryStatus')
    name: string; // Human-readable name
    description: string; // What the report shows
    category: string; // Grouping: 'Entries' | 'Draws' | 'MatchUps' | 'Participants' | 'Scheduling' | 'Audit'
    source?: 'factory' | 'server'; // Where data comes from (default: 'factory')
    computableNow: boolean; // Whether the tournament has sufficient data
  }>;
}
```

**Examples:**

```js
const { availableReports } = tournamentEngine.getAvailableReports();

// Show only computable reports
const ready = availableReports.filter((r) => r.computableNow);
console.log(`${ready.length} reports available`);

ready.forEach((r) => {
  console.log(`[${r.category}] ${r.name} — ${r.description}`);
});

// Group by category
const byCategory = Object.groupBy(ready, (r) => r.category);
```

**Registered Reports:**

| Report ID                        | Name                      | Category     | Requires            |
| -------------------------------- | ------------------------- | ------------ | ------------------- |
| `entries.entryStatus`            | Entry Status Report       | Entries      | Events              |
| `structure.drawReport`           | Draw Structure Report     | Draws        | Events              |
| `matchUp.results`                | Match Results             | MatchUps     | Completed draws     |
| `matchUp.statusSummary`          | MatchUp Status Summary    | MatchUps     | Completed draws     |
| `matchUp.competitiveness`        | Match Competitiveness     | MatchUps     | Completed draws     |
| `participant.results`            | Participant Results       | Participants | Completed draws     |
| `participant.seedingPerformance` | Seeding Performance       | Participants | Seeded participants |
| `participant.teamStats`          | Team Statistics           | Participants | Team participants   |
| `venue.utilization`              | Venue Utilization         | Scheduling   | Venues              |
| `scheduling.callTimingVariance`  | Call Timing Variance      | Scheduling   | Venues              |
| `participant.recoveryTime`       | Participant Recovery Time | Scheduling   | Scheduled matchUps  |
| `participant.experience`         | Participant Experience    | Participants | Scheduled matchUps  |
| `audit.mutationLog`              | Mutation Log              | Audit        | Server audit trail  |
| `audit.drawRevisions`            | Draw Revision History     | Audit        | Server audit trail  |
| `audit.schedulingChurn`          | Scheduling Churn          | Audit        | Server audit trail  |
| `audit.positionChanges`          | Position Changes          | Audit        | Server audit trail  |

Reports with `source: 'server'` require data from the server audit trail and cannot be generated from the tournament record alone.

"Scheduled matchUps" means at least one matchUp carries a `scheduledTime`, `startTime`, or `calledAt`. Without one of those anchors every matchUp is undatable and the two timeline reports would return zero rows, so `computableNow` is `false` rather than producing an empty table.

---

## buildReportContext

Pre-hydrates participants, matchUps, and venues into a reusable context object. Use this when generating multiple reports to avoid redundant data fetching.

**Parameters:**

```ts
{
  tournamentRecord: Tournament;
}
```

**Returns:**

```ts
{
  tournamentRecord: Tournament;
  participantMap: Record<string, any>;  // Hydrated with scales, events, seeding, draws
  matchUps: HydratedMatchUp[];
  venues: Venue[];
}
```

**Examples:**

```js
const context = tournamentEngine.buildReportContext();

// Use context for multiple reports (avoids re-hydrating participants each time)
const report1 = tournamentEngine.generateReport({ reportId: 'entries.entryStatus' });
const report2 = tournamentEngine.generateReport({ reportId: 'matchUp.results' });
```

---

## generateReport

Generates a report by ID, returning a unified shape with columns and rows suitable for table rendering, PDF export, or data serialization.

**Parameters:**

```ts
{
  tournamentRecord: Tournament;
  reportId: string;               // One of the registered report IDs
  parameters?: Record<string, any>; // Optional report-specific parameters
}
```

**Returns:**

```ts
{
  reportId: string;
  generatedAt: string;            // ISO timestamp
  parameters?: Record<string, any>;
  columns: Array<{
    key: string;                  // Field name in row data
    title: string;                // Display header
    type?: 'string' | 'number' | 'boolean' | 'date';
    width?: number;
  }>;
  rows: Record<string, any>[];   // Array of row objects keyed by column.key
  summary?: Record<string, any>; // Optional aggregate data
}
```

**Examples:**

```js
// Generate a specific report
const result = tournamentEngine.generateReport({
  reportId: 'entries.entryStatus',
});

console.log(result.columns); // [{ key: 'participantName', title: 'Participant', type: 'string' }, ...]
console.log(result.rows.length); // 32

// Render as a table
result.columns.forEach((col) => process.stdout.write(col.title.padEnd(20)));
result.rows.forEach((row) => {
  result.columns.forEach((col) => process.stdout.write(String(row[col.key]).padEnd(20)));
});

// Export as CSV
const header = result.columns.map((c) => c.title).join(',');
const csv = [header, ...result.rows.map((row) => result.columns.map((c) => String(row[c.key] ?? '')).join(','))].join(
  '\n',
);

// Export as JSON
const json = JSON.stringify(result, null, 2);

// Rows may include extra fields (e.g., participantId) not in columns — useful for lookups
// Only column keys should be rendered in UI; extra fields are for CSV/JSON export
```

**Report-specific parameters:**

Most reports take no parameters. The two timeline reports — [Participant Recovery Time](#participant-recovery-time-report) and [Participant Experience](#participant-experience-report) — accept these:

```ts
{
  timeZone?: string;            // IANA zone, e.g. 'America/New_York' — preferred
  utcOffsetMinutes?: number;    // venue offset from UTC (local = UTC + offset); default 0
  policyDefinitions?: PolicyDefinitions;  // evaluate against a policy not attached to the record
  asOfMs?: number;              // ignore matchUps starting after this instant
}
```

:::warning Prefer `timeZone` over `utcOffsetMinutes`
`utcOffsetMinutes` is the offset at **one** moment. Applied to a tournament that spans a daylight-saving transition it is wrong by an hour on the far side of it — silently, in a report whose entire subject is minutes. A participant finishing 22:00 and starting 08:00 across a spring-forward actually rested **nine** hours; a fixed offset reports ten.

Supplying an IANA `timeZone` resolves the offset per instant instead. `utcOffsetMinutes` remains the fallback when no zone is given or the zone is not recognised, so existing callers are unaffected and an unknown zone degrades to previous behaviour rather than throwing.
:::

`policyDefinitions` answers "what would this tournament look like under a _different_ scheduling policy" without mutating the record. It follows the usual precedence — a supplied policy wins over the one attached to the tournament.

**Row identifiers not present in `columns`:**

Several reports emit ids that are deliberately absent from `columns`. Consumers hide them, but they are what lets a table resolve the participant behind a displayed name — to open a participant card — or navigate from a row to its matchUp, and they survive to CSV/JSON export.

| Report                          | Identifier fields                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `structure.drawReport`          | `winningParticipantId`                                                                                              |
| `matchUp.results`               | `side1ParticipantId`, `side2ParticipantId`, `winningParticipantId`, `eventId`, `drawId`, `structureId`, `matchUpId` |
| `matchUp.competitiveness`       | `side1ParticipantId`, `side2ParticipantId`, `eventId`, `drawId`, `structureId`, `matchUpId`                         |
| `scheduling.callTimingVariance` | `side1ParticipantId`, `side2ParticipantId`, `eventId`, `drawId`, `structureId`, `matchUpId`                         |
| `participant.teamStats`         | `participantId`                                                                                                     |
| `participant.recoveryTime`      | `participantId`, `eventId`, `drawId`, `structureId`, `matchUpId`                                                    |
| `participant.experience`        | `participantId`                                                                                                     |

A doubles side yields its **PAIR** id; a consumer hydrates individuals from that, so a partner can still be opened individually. `structure.drawReport` is the exception — it resolves to the **individual the row actually names**, because the report is person-oriented throughout and its winner column already shows only the first individual of a pair. An id resolving to the PAIR would disagree with the name displayed beside it.

Where no value can be determined — an undecided structure winner, a side with no participant — the field is an empty string rather than a guess.

**Error handling:**

```js
// Unknown report ID
const result = tournamentEngine.generateReport({ reportId: 'nonexistent' });
// { error: 'Invalid reportId' }

// Server-sourced report (audit.*)
const result = tournamentEngine.generateReport({ reportId: 'audit.mutationLog' });
// { error: 'Invalid reportId' }
// Server-sourced reports must be fetched from the audit worker, not from generateReport
```

---

## Call Timing Variance Report

`reportId: 'scheduling.callTimingVariance'` — for every matchUp that carries both a planned `scheduledTime` and an actual `calledAt` (the timestamp stamped when a matchUp is called to court via the schedule "Now" strip), reports the signed variance in minutes.

- **Positive variance** = the match was called **late** (running behind schedule).
- **Negative variance** = the match was called **early**.

Rows are sorted worst-late first, so the matches that ran furthest behind surface at the top. This quantifies how far behind an event is running — useful for operations that reliably run late and want to measure the drift.

**Parameters:**

```ts
{
  utcOffsetMinutes?: number; // Venue offset from UTC (local = UTC + offset). Default 0.
}
```

`calledAt` is stored as a UTC ISO timestamp while `scheduledTime` is a wall-clock `"HH:mm"`. Supply `utcOffsetMinutes` (e.g. `-300` for US Eastern Standard Time) so absolute variance is accurate; omit it to treat both in the same frame (the relative ordering of variances is unaffected by the offset). TMX passes the operator's browser offset automatically, which matches the venue timezone when the tournament is run on-site.

**Columns:** `eventName`, `drawName`, `roundName`, `matchUp`, `venueName`, `courtName`, `scheduledDate`, `scheduledTime`, `calledAt`, `varianceMinutes`.

`scheduledTime` and `calledAt` display as bare clock times (`HH:mm`); `calledAt` is prefixed with its date only when the call fell on a different calendar day than `scheduledDate`. Each row also carries `calledAtIso` (the full UTC timestamp) for lossless export.

**Summary:**

```ts
{
  matchUpsWithCallData: number; // rows in the report
  scheduledButUncalled: number; // scheduled matchUps that were never called to court
  averageVarianceMinutes: number;
  medianVarianceMinutes: number;
  maxVarianceMinutes: number; // worst late
  minVarianceMinutes: number; // earliest call
  calledLateCount: number;
  calledLatePercentage: number;
  utcOffsetMinutes: number; // echo of the parameter used
}
```

**Example:**

```js
const result = tournamentEngine.generateReport({
  reportId: 'scheduling.callTimingVariance',
  parameters: { utcOffsetMinutes: -300 }, // US Eastern Standard Time
});

console.log(`${result.summary.calledLatePercentage}% of matches called late`);
console.log(`Worst delay: ${result.summary.maxVarianceMinutes} min`);
result.rows.slice(0, 5).forEach((r) => {
  console.log(`${r.matchUp} on ${r.courtName}: ${r.varianceMinutes >= 0 ? '+' : ''}${r.varianceMinutes} min`);
});
```

The report is listed (`computableNow: true`) whenever the tournament has venues; rows populate once matchUps are called to court. Until then the report is empty and `summary.scheduledButUncalled` reflects scheduled matchUps still awaiting a call.

---

## Participant Recovery Time Report

`reportId: 'participant.recoveryTime'` — one row per **individual participant per matchUp played**, in chronological order, across every day of the tournament.

The live schedule Inspector scopes its rest analysis to a single calendar day by design, which makes overnight turnaround invisible — and the overnight rule carries the largest figure in the rulebook. Spanning days is the point of this report.

**Columns:**

| Key                        | Title          | Meaning                                             |
| -------------------------- | -------------- | --------------------------------------------------- |
| `participantName`          | Participant    | The individual, not the entry                       |
| `scheduledDate`            | Date           | Venue-local date                                    |
| `matchNumber`              | #              | Ordinal within that participant's day               |
| `eventName` / `roundName`  | Event / Round  | Where the matchUp sits                              |
| `startTime` / `finishTime` | Start / Finish | Venue-local wall clock                              |
| `durationMinutes`          | On Court       | Time on court                                       |
| `durationSource`           | Duration From  | Which rung produced `durationMinutes`               |
| `recoveryReceived`         | Recovery       | Minutes since the previous matchUp **the same day** |
| `recoveryRequired`         | Required       | What the policy required after that matchUp         |
| `recoveryDeficit`          | Deficit        | `required - received`, floored at 0                 |
| `overnightReceived`        | Overnight      | Minutes since the **previous day's** last finish    |
| `overnightRequired`        | Overnight Req  | Overnight minimum for the participant's category    |
| `waitMinutes`              | Wait           | Planned `scheduledTime` → actual `calledAt`         |
| `finishSource`             | Finish From    | Which rung produced `finishTime`                    |

**Same-day and cross-day gaps are scoped separately.** A same-day gap is measured against `recoveryMinutes`; a cross-day gap against `overnightMinutes`. Measuring one against the other would manufacture a huge surplus or deficit on every first matchUp of the day.

Recovery is a property of the matchUp just **completed** — the scheduler reads it the same way. When a participant crosses singles ↔ doubles, the previous matchUp's `typeChangeRecoveryMinutes` applies instead, which is generally the larger figure.

**Provenance: an inferred number must never read as a measured one.**

`finishSource`, strongest rung first:

| Value           | Derived from                                       |
| --------------- | -------------------------------------------------- |
| `endTime`       | An explicit end time                               |
| `scoredTime`    | When a score was first entered                     |
| `startTime`     | Start + the policy's `averageMinutes` (projection) |
| `calledAt`      | Call to court + `averageMinutes` (projection)      |
| `scheduledTime` | Planned time + `averageMinutes` (projection)       |

`scoredTime` carries the load in practice rather than `endTime`: clients write an end time only on an explicit operator action, while the factory auto-captures `scoredTime` on the first meaningful score. A late-entered score pushes the anchor _after_ the true finish, so recovery is understated — the conservative direction, reporting a player as less rested rather than more. `scoredTime` is bounded to twelve hours past the start; beyond that it is treated as a later correction rather than a finish, and the ladder falls through to a projection.

`durationSource`:

| Value        | Derived from                                                  |
| ------------ | ------------------------------------------------------------- |
| `measured`   | Start → end                                                   |
| `scoredTime` | Start → score entry                                           |
| `calledAt`   | Call to court → score entry                                   |
| `estimated`  | The policy's `averageMinutes` — **not an observation at all** |

**Which matchUps count.** Walkovers, double walkovers, and cancellations are excluded — charging a participant full recovery and estimated court time for a matchUp they never played would corrupt every figure downstream. A default is included only when it carries a score, because a default with a score was played up to the point of the default and one without is a no-show; nothing else in the record distinguishes them.

Rows are sorted worst experience first — largest deficit, then longest wait — because an operator opening this report is looking for who was treated worst, not for row one.

**Summary:**

```ts
{
  appearances: number;                  // rows, i.e. individual-matchUp pairs
  participants: number;
  shortRecoveryCount: number;           // rows with a deficit above zero
  worstRecoveryDeficit: number;
  estimatedDurationCount: number;
  estimatedDurationPercentage: number;  // how much of this report is prediction
  utcOffsetMinutes: number;
  timeZone?: string;
}
```

`estimatedDurationPercentage` is not decoration. Without it, an average built mostly from estimates reads as a finding.

**Example:**

```js
const result = tournamentEngine.generateReport({
  reportId: 'participant.recoveryTime',
  parameters: { timeZone: 'America/New_York' },
});

console.log(`${result.summary.shortRecoveryCount} short rests`);
console.log(`${result.summary.estimatedDurationPercentage}% of durations are estimates`);

result.rows.slice(0, 5).forEach((r) => {
  console.log(`${r.participantName} ${r.scheduledDate}: got ${r.recoveryReceived}, needed ${r.recoveryRequired}`);
});
```

---

## Participant Experience Report

`reportId: 'participant.experience'` — one row per **individual participant**, rolled up across the whole tournament. Built on the same timeline core as the recovery report, so the two can never disagree.

**Columns:**

| Key                    | Title         | Meaning                                                    |
| ---------------------- | ------------- | ---------------------------------------------------------- |
| `participantName`      | Participant   |                                                            |
| `daysPlayed`           | Days          | Distinct days played                                       |
| `matchesPlayed`        | Matches       |                                                            |
| `busiestDayMatches`    | Busiest Day   | Most matchUps in a single day                              |
| `courtMinutes`         | On Court      | Total time on court                                        |
| `estimatedPct`         | Estimated %   | Share of this participant's durations that are projections |
| `shortRecoveryCount`   | Short Rests   | Same-day gaps below requirement                            |
| `worstRecoveryDeficit` | Worst Deficit |                                                            |
| `shortOvernightCount`  | Short Nights  | Nights below the overnight minimum                         |
| `worstOvernight`       | Worst Night   | Shortest overnight turnaround received                     |
| `meanWaitMinutes`      | Mean Wait     | Undefined rather than zero when nothing was called         |
| `maxWaitMinutes`       | Max Wait      |                                                            |
| `longestDayMinutes`    | Longest Day   | First **expected** time → last finish                      |

`longestDayMinutes` is anchored to when the participant was first _expected_, not when they first played. Being told 09:00 and first walking on at 20:00 is eleven hours of the experience that a first-start anchor erases.

Wait is reported as mean and max rather than a standard deviation: a participant consistently called 15 minutes late had a predictable tournament and one swinging −30/+180 had a chaotic one at the same mean, and operators read minutes rather than sigma.

:::info Deliberately not a composite score
There is no weighted "experience index". One would invent an authority the data does not have and launder estimated durations into a single confident number. These are sortable counts; the operator decides what "worst" means. If a band is ever wanted, derive it from `worstRecoveryDeficit` alone — the one quantity with a rulebook behind it.
:::

**Summary:**

```ts
{
  participants: number;
  appearances: number;
  participantsWithShortRecovery: number;
  participantsWithShortOvernight: number;
  estimatedDurationPercentage: number;
  utcOffsetMinutes: number;
  timeZone?: string;
}
```

**Example:**

```js
const result = tournamentEngine.generateReport({
  reportId: 'participant.experience',
  parameters: { timeZone: 'America/New_York' },
});

console.log(`${result.summary.participantsWithShortOvernight} participants had a short night`);

// Who had the hardest tournament
const worst = [...result.rows].sort((a, b) => b.worstRecoveryDeficit - a.worstRecoveryDeficit)[0];
console.log(`${worst.participantName}: ${worst.matchesPlayed} matches over ${worst.daysPlayed} days`);
```

:::tip Overnight requires a configured rule
`overnightRequired`, `shortOvernightCount`, and `worstOvernight` depend on `defaultTimes.overnightTimes` in the scheduling policy. Where no rule is configured for a participant's category — adult play carries no equivalent to the junior twelve-hour rule — the requirement is absent and nothing is flagged. Absent means **"no rule configured"**, which a consumer must report rather than substituting a figure of its own. See [Scheduling Policy](/docs/policies/scheduling#overnight-recovery).
:::

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
result.allParticipantStats.forEach((stats) => {
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
  tournamentRecord: Tournament; // Required tournament record
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
Object.values(reports.eventReports).forEach((eventReport) => {
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

participantEntries.forEach((entry) => {
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
wildcards?.forEach((wc) => {
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
Object.values(reports.eventStructureReports).forEach((eventReport) => {
  console.log(`Event: ${eventReport.eventId}`);
  console.log(`  Generated Draws: ${eventReport.generatedDrawsCount}`);
  console.log(`  Total Manipulations: ${eventReport.totalPositionManipulations}`);
  console.log(`  Draw Deletions: ${eventReport.drawDeletionsCount}`);
});

// Structure-level details
reports.structureReports.forEach((structure) => {
  console.log(`${structure.eventName} - ${structure.structureName}:`);
  console.log(`  Structure Type: ${structure.structureType}`);
  console.log(`  Size: ${structure.structureSize}`);
  console.log(`  Participants: ${structure.participantsCount}`);
  console.log(`  Seeds: ${structure.seedsCount}`);
  console.log(`  Avg WTN: ${structure.averageWTN?.toFixed(2) || 'N/A'}`);
  console.log(`  Format: ${structure.matchUpFormat}`);

  if (structure.positionManipulations > 0) {
    console.log(`  Manipulations: ${structure.positionManipulations}`);
    structure.manipulations?.forEach((m) => console.log(`    - ${m}`));
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
    { name: 'drawProfile', label: 'profile' },
  ],
});

reports.structureReports.forEach((structure) => {
  console.log(structure.metadata); // Custom extension data
  console.log(structure.profile); // Another extension
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

reports.flightReports.forEach((flight) => {
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

**Identifying the winner:**

`structureReports` identifies a winner by `winningPersonId` — a **person** id — alongside `winningTeamId` for team structures. A person id cannot be passed to `getParticipants`, so it does not on its own answer "which participant is this".

The wrapped `structure.drawReport` row therefore also carries `winningParticipantId`, resolved from whichever of the two is present, and it is what a consumer should use to open a participant card:

```js
const result = tournamentEngine.generateReport({ reportId: 'structure.drawReport' });

const row = result.rows[0];
if (row.winningParticipantId) {
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [row.winningParticipantId] },
  });
}
```

It resolves to the **individual the row names**, not to the pair — see the identifier table under [`generateReport`](#generatereport) — and is an empty string when no winner has been decided, rather than a guess.

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
      [date: string]: {
        // One entry per date
        availableCourts: number; // Courts with availability on this date
        availableMinutes: number; // Total minutes available across all courts
        scheduledMinutes: number; // Total minutes with scheduled matchUps
        scheduledMatchUpsCount: number; // Number of matchUps scheduled
        percentUtilization: string; // Percentage (scheduledMinutes/availableMinutes)
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

result.venuesReport.forEach((venue) => {
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
result.venuesReport.forEach((venue) => {
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
result.venuesReport.forEach((venue) => {
  Object.entries(venue.venueReport).forEach(([date, stats]) => {
    const utilization = parseFloat(stats.percentUtilization);
    if (utilization < 50 && stats.availableCourts > 0) {
      console.log(
        `💡 ${venue.venueName} on ${date}: Only ${utilization}% utilized (${stats.availableCourts} courts available)`,
      );
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
