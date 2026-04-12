---
title: Competition Governor
---

```js
import { competitionGovernor } from 'tods-competition-factory';
```

The **competitionGovernor** provides functions for managing multi-tournament competitions where several `tournamentRecords` are held in shared state. These methods enable linking tournaments together, sharing venues and schedules across tournaments, and managing competition-wide extensions.

**Use Cases:**

- Multi-site tournament management (e.g., US Open across multiple locations)
- Tournament series with shared participants and venues
- Linked qualifying and main draw tournaments
- Federation-level competition management

---

## linkTournaments

Links all tournaments currently loaded in competitionEngine state by adding a LINKED_TOURNAMENTS extension to each tournament record. Linked tournaments can share venues, schedule cross-tournament matchUps, and be managed as a unified competition. See examples: [Linked Tournaments & Shared Venues](../concepts/venues-courts.md#linked-tournaments-shared-venues).

**Purpose:** Establish relationships between multiple tournaments to enable competition-wide operations like shared venue management, cross-tournament scheduling, and unified participant tracking.

**When to Use:**

- Managing multi-site tournaments (same event across venues)
- Linking qualifying and main draw tournaments
- Creating tournament series with shared resources
- Enabling cross-tournament scheduling and venue management
- Federating multiple tournaments under single administration

**Parameters:**

```ts
{
  tournamentRecords?: TournamentRecords;  // Optional - from engine state if not provided
}
```

**Returns:**

```ts
{
  success: boolean;
  error?: ErrorType;                      // MISSING_TOURNAMENT_RECORDS if no tournaments in state
}
```

**Link Mechanism:**

- Adds LINKED_TOURNAMENTS extension to each tournament
- Extension contains array of all linked tournament IDs
- Each tournament knows about all other linked tournaments
- Minimum of 2 tournaments required for linking

**Examples:**

```js
import { competitionEngine } from 'tods-competition-factory';

// Load multiple tournaments into competition state
await competitionEngine.setState([qualifyingTournament, mainDrawTournament, doublesOnlyTournament]);

// Link all tournaments in state
const result = await competitionEngine.linkTournaments();
console.log(result.success); // true

// Verify links were created
const { linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds();
console.log(linkedTournamentIds);
// {
//   'qualifying-id': ['main-draw-id', 'doubles-only-id'],
//   'main-draw-id': ['qualifying-id', 'doubles-only-id'],
//   'doubles-only-id': ['qualifying-id', 'main-draw-id']
// }

// Check extension on individual tournament
const { tournamentRecord } = competitionEngine.getTournament({
  tournamentId: 'qualifying-id',
});
const linkedExtension = tournamentRecord.extensions.find((ext) => ext.name === 'linkedTournaments');
console.log(linkedExtension.value);
// { tournamentIds: ['qualifying-id', 'main-draw-id', 'doubles-only-id'] }

// Add another tournament and re-link
competitionEngine.setTournamentRecord(teamEventTournament);
await competitionEngine.linkTournaments();

// All four tournaments now linked together
const { linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds();
console.log(Object.keys(linkedTournamentIds).length); // 4

// Single tournament in state - success but no links created
competitionEngine.reset();
competitionEngine.setState(singleTournament);
const result = await competitionEngine.linkTournaments();
console.log(result.success); // true (but no extension added)
```

**Notes:**

- Requires at least 2 tournaments loaded in state
- Overwrites any existing LINKED_TOURNAMENTS extension
- Links are bidirectional - each tournament links to all others
- Safe to call multiple times (idempotent with current state)
- New tournament added after initial linking requires relinking
- Enables cross-tournament venue sharing and scheduling
- Required for `allCompetitionMatchUps()` to work across tournaments
- Does not copy venues between tournaments automatically
- Tournament must have at least tournamentId property
- Returns success with single tournament (no-op)

---

## unlinkTournament

Unlinks a specific tournament from other tournaments loaded in state by removing it from LINKED_TOURNAMENTS extensions across all linked tournaments.

**Purpose:** Remove a tournament from a linked competition while preserving links between remaining tournaments. Useful for removing qualifying tournaments after completion or isolating a tournament for independent management.

**When to Use:**

- Removing completed qualifying tournament from active competition
- Isolating a tournament for independent scheduling
- Handling tournament withdrawal from series
- Breaking up competition into separate managements
- Removing test tournaments from production data

**Parameters:**

```ts
{
  tournamentId: string;                   // Required - ID of tournament to unlink
  tournamentRecords?: TournamentRecords;  // Optional - from engine state if not provided
}
```

**Returns:**

```ts
{
  success: boolean;
  error?: ErrorType;                      // MISSING_TOURNAMENT_ID, INVALID_VALUES, etc.
}
```

**Unlinking Logic:**

- Removes tournamentId from LINKED_TOURNAMENTS extensions in other tournaments
- Removes LINKED_TOURNAMENTS extension from unlinked tournament
- If remaining linked tournaments = 1, removes their extension too (no point linking to self)
- Preserves links between remaining tournaments (if 2+)

**Examples:**

```js
import { competitionEngine } from 'tods-competition-factory';

// Setup: Link three tournaments
await competitionEngine.setState([qualifyingTournament, mainDrawTournament, doublesOnlyTournament]);
await competitionEngine.linkTournaments();

// Unlink the qualifying tournament (now complete)
const result = await competitionEngine.unlinkTournament({
  tournamentId: 'qualifying-id',
});
console.log(result.success); // true

// Check remaining links
const { linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds();
console.log(linkedTournamentIds);
// {
//   'main-draw-id': ['doubles-only-id'],
//   'doubles-only-id': ['main-draw-id']
// }
// Note: qualifying-id no longer appears

// Verify qualifying tournament has no links
const { tournamentRecord } = competitionEngine.getTournament({
  tournamentId: 'qualifying-id',
});
const linkedExtension = tournamentRecord.extensions?.find((ext) => ext.name === 'linkedTournaments');
console.log(linkedExtension); // undefined

// Unlink down to single tournament - removes extension entirely
await competitionEngine.unlinkTournament({
  tournamentId: 'doubles-only-id',
});

const { tournamentRecord: mainRecord } = competitionEngine.getTournament({
  tournamentId: 'main-draw-id',
});
const stillLinked = mainRecord.extensions?.find((ext) => ext.name === 'linkedTournaments');
console.log(stillLinked); // undefined (can't be linked to only yourself)

// Error handling
result = await competitionEngine.unlinkTournament({
  tournamentId: 'nonexistent-id',
});
console.log(result.error); // MISSING_TOURNAMENT_ID

// Unlinking already unlinked tournament succeeds
result = await competitionEngine.unlinkTournament({
  tournamentId: 'qualifying-id',
});
console.log(result.success); // true (idempotent)

// Multi-tournament workflow example
// Day 1-3: Qualifying
await competitionEngine.setState([qualifyingTournament]);
// ... run qualifying ...

// Day 4-10: Main draw starts, link with qualifying
await competitionEngine.setState([qualifyingTournament, mainDrawTournament]);
await competitionEngine.linkTournaments();
// ... access combined data ...

// Day 11+: Qualifying done, unlink it
await competitionEngine.unlinkTournament({
  tournamentId: qualifyingTournament.tournamentId,
});
// ... continue with just main draw ...
```

**Notes:**

- Tournament must exist in state
- Modifies LINKED_TOURNAMENTS extension across all affected tournaments
- When 2 tournaments remain after unlinking, they stay linked to each other
- When 1 tournament remains after unlinking, its extension is removed (can't self-link)
- Unlinked tournament's extension is always removed
- Does not remove tournament from state - only removes links
- Safe to call on already unlinked tournaments (idempotent)
- Does not affect venues, participants, or schedule
- Useful for phased competition management (qualifying → main → finals)
- Does not automatically update `allCompetitionMatchUps()` results

---

## unlinkTournaments

Removes LINKED_TOURNAMENTS extension from all tournaments currently loaded in state. Effectively dissolves the competition into independent tournaments.

**Purpose:** Break all links between tournaments in a competition, returning each tournament to independent management. Useful for competition teardown or converting linked competitions back to standalone tournaments.

**When to Use:**

- Ending a competition series
- Resetting tournament relationships for fresh linking
- Converting linked competition back to independent tournaments
- Cleaning up test data
- Preparing tournaments for export as standalone records

**Parameters:**

```ts
{
  tournamentRecords?: TournamentRecords;  // Optional - from engine state if not provided
  discover?: boolean;                     // Traverse extensions to find nested links
}
```

**Returns:**

```ts
{
  success: boolean;
  error?: ErrorType;                      // MISSING_TOURNAMENT_RECORDS if no tournaments
}
```

**Examples:**

```js
import { competitionEngine } from 'tods-competition-factory';

// Setup: Linked competition
await competitionEngine.setState([
  qualifyingTournament,
  mainDrawTournament,
  doublesOnlyTournament,
  teamEventTournament,
]);
await competitionEngine.linkTournaments();

// Verify links exist
let { linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds();
console.log(Object.keys(linkedTournamentIds).length); // 4 tournaments linked

// Unlink all tournaments
const result = await competitionEngine.unlinkTournaments();
console.log(result.success); // true

// Verify all links removed
({ linkedTournamentIds } = await competitionEngine.getLinkedTournamentIds());
console.log(linkedTournamentIds); // {} (empty object)

// Check individual tournament
const { tournamentRecord } = competitionEngine.getTournament({
  tournamentId: 'main-draw-id',
});
const linkedExtension = tournamentRecord.extensions?.find((ext) => ext.name === 'linkedTournaments');
console.log(linkedExtension); // undefined

// Competition teardown workflow
// 1. Competition complete
// 2. Unlink all tournaments
await competitionEngine.unlinkTournaments();

// 3. Export individual tournaments
const tournaments = await competitionEngine.getState();
for (const [tournamentId, tournamentRecord] of Object.entries(tournaments)) {
  await exportTournament(tournamentRecord); // Independent exports
}

// Fresh start workflow
// Reset links before establishing new relationships
await competitionEngine.unlinkTournaments();
// ... modify tournament composition ...
await competitionEngine.linkTournaments(); // Create fresh links

// Idempotent - safe to call multiple times
await competitionEngine.unlinkTournaments();
const result2 = await competitionEngine.unlinkTournaments();
console.log(result2.success); // true
```

**Notes:**

- Removes LINKED_TOURNAMENTS extension from all tournaments in state
- Does not remove tournaments from state - only removes links
- Equivalent to calling `unlinkTournament()` for each tournament
- More efficient than unlinking individually
- Idempotent - safe to call when no links exist
- Does not affect venues, participants, schedules, or other extensions
- Required before creating new link structure with different tournaments
- Use `removeExtension({ name: 'linkedTournaments' })` for same effect — see [removeExtension](/docs/governors/tournament-governor#removeextension) in tournament governor

---

## getTournamentIds

Returns an array of all tournament IDs currently loaded in the competition engine state.

```js
const { tournamentIds } = competitionEngine.getTournamentIds();
console.log(tournamentIds); // ['tournament-1-id', 'tournament-2-id']
```

**Returns:**

```ts
{
  tournamentIds: string[];
  success: boolean;
}
```

**Use Cases:**

- Iterate over all tournaments in competition
- Verify tournaments are loaded
- Check competition size

---

## getLinkedTournamentIds

Returns a mapping object where each tournament ID maps to an array of other tournament IDs it is linked to via the LINKED_TOURNAMENTS extension.

```js
const { linkedTournamentIds } = competitionEngine.getLinkedTournamentIds();
console.log(linkedTournamentIds);
// {
//   'qualifying-id': ['main-draw-id', 'doubles-id'],
//   'main-draw-id': ['qualifying-id', 'doubles-id'],
//   'doubles-id': ['qualifying-id', 'main-draw-id']
// }

// Check if specific tournament is linked
const qualifyingLinks = linkedTournamentIds['qualifying-id'];
if (qualifyingLinks?.includes('main-draw-id')) {
  console.log('Qualifying is linked to main draw');
}
```

**Returns:**

```ts
{
  linkedTournamentIds: {
    [tournamentId: string]: string[];  // Array of linked tournament IDs
  };
  error?: ErrorType;  // MISSING_TOURNAMENT_RECORDS if no tournaments in state
}
```

**Notes:**

- Each tournament ID maps to an array of OTHER tournament IDs (excludes itself)
- Empty array means tournament has no links
- Only returns tournaments that have LINKED_TOURNAMENTS extension
- Use after `linkTournaments()` to verify links were created

---

## Competition Policy Methods

The following methods manage per-draw competition state for policy-driven rating systems (dynamic form ratings, pressure ratings, leaderboards). Competition state is stored as a `COMPETITION_STATE` extension on a `drawDefinition` and is governed by a `POLICY_TYPE_COMPETITION` applied policy.

---

### initializeCompetitionState

Initializes competition state for a draw by computing baseline ratings for all participants and storing the initial state as a `COMPETITION_STATE` extension on the draw definition.

**Parameters:**

```ts
{
  tournamentRecord: Tournament;   // Required - tournament containing participants
  drawDefinition: DrawDefinition; // Required - draw to attach state to
  participantIds: string[];       // Required - participants to include in competition state
  event?: Event;                  // Optional - used for eventType-aware rating resolution
}
```

**Returns:**

```ts
{
  success?: boolean;
  competitionState?: CompetitionState; // The initialized state (participantStates + roundStates)
  error?: ErrorType;                   // MISSING_DRAW_DEFINITION, MISSING_VALUE
}
```

**Example:**

```js
const result = engine.initializeCompetitionState({
  tournamentRecord,
  drawDefinition,
  participantIds: ['p1', 'p2', 'p3', 'p4'],
  event,
});

const { competitionState } = result;
console.log(competitionState.participantStates['p1']);
// {
//   participantId: 'p1',
//   baselineRating: 1500,
//   dynamicFormRating: 1500,
//   pressureRating: 0,
//   roundsPlayed: 0,
//   wins: 0, losses: 0, draws: 0,
//   totalPointsWon: 0, totalPointsLost: 0,
//   ratingHistory: []
// }
```

**Notes:**

- Requires a `POLICY_TYPE_COMPETITION` policy to be applied; returns success with no state if policy is absent
- Baseline ratings are resolved via the policy's `ratingPolicy.baselineRating.scaleName` using the same infrastructure as DrawMatic
- For DOUBLES events, individual participant ratings are aggregated using the policy's `ratingAggregation` method (AVERAGE, MIN, MAX, SUM)
- State is persisted as a `COMPETITION_STATE` extension on the drawDefinition

---

### processCompetitionMatchUp

Processes a single completed matchUp, updating both participants' dynamic form ratings, pressure ratings, win/loss records, and rating histories based on the competition policy.

**Parameters:**

```ts
{
  tournamentRecord?: Tournament;   // Optional - for policy resolution
  drawDefinition: DrawDefinition;  // Required - draw containing competition state
  matchUp: MatchUp;               // Required - the completed matchUp to process
  event?: Event;                   // Optional - for policy resolution
}
```

**Returns:**

```ts
{
  success?: boolean;
  error?: ErrorType;  // MISSING_DRAW_DEFINITION, MISSING_MATCHUP
}
```

**Example:**

```js
const result = engine.processCompetitionMatchUp({
  tournamentRecord,
  drawDefinition,
  matchUp: completedMatchUp,
  event,
});
```

**Notes:**

- Both sides must have participantIds and existing participant states; silently succeeds if not
- Uses Elo-style expected score calculations with the policy's `logisticScale` and `kFactor`
- Dynamic form rating updates use dynamic-vs-dynamic expectations
- Pressure rating deltas use actual-vs-baseline expectations
- Point counts are derived from the matchUp score via `deriveCountables`
- Updated state is persisted back to the `COMPETITION_STATE` extension

---

### processCompetitionRound

Processes all completed matchUps in a given round number, updating competition state for each, and marks the round as processed to prevent double-processing.

**Parameters:**

```ts
{
  tournamentRecord?: Tournament;   // Optional - for policy resolution
  drawDefinition: DrawDefinition;  // Required - draw containing competition state
  roundNumber: number;             // Required - the round to process
  matchUps: MatchUp[];            // Required - all matchUps in the draw (filtered internally)
  event?: Event;                   // Optional - for policy resolution
}
```

**Returns:**

```ts
{
  success?: boolean;
  error?: ErrorType;  // MISSING_DRAW_DEFINITION
}
```

**Example:**

```js
const result = engine.processCompetitionRound({
  tournamentRecord,
  drawDefinition,
  roundNumber: 1,
  matchUps: allDrawMatchUps,
  event,
});
```

**Notes:**

- Filters matchUps to the specified `roundNumber` and only those with a `winningSide` or a completed matchUpStatus
- Delegates to `processCompetitionMatchUp` for each qualifying matchUp
- Marks the round as `processed: true` in `competitionState.roundStates` to prevent re-processing
- Idempotent: silently succeeds if the round was already processed

---

### resetCompetitionState

Removes the `COMPETITION_STATE` extension from a draw definition, clearing all accumulated competition data.

**Parameters:**

```ts
{
  drawDefinition: DrawDefinition;  // Required - draw to reset
}
```

**Returns:**

```ts
{
  success?: boolean;
  error?: ErrorType;  // MISSING_DRAW_DEFINITION
}
```

**Example:**

```js
const result = engine.resetCompetitionState({ drawDefinition });
// Competition state is now cleared; call initializeCompetitionState to start fresh
```

**Notes:**

- Sets the `COMPETITION_STATE` extension value to `undefined`
- Does not remove the competition policy; only clears accumulated state
- Useful before re-initializing state after draw modifications

---

### getCompetitionState

Retrieves the current `CompetitionState` stored on a draw definition, including all participant states and round processing records.

**Parameters:**

```ts
{
  drawDefinition: DrawDefinition;  // Required - draw to read state from
}
```

**Returns:**

```ts
{
  competitionState?: CompetitionState;
  // CompetitionState contains:
  //   participantStates: Record<string, CompetitionParticipantState>
  //   roundStates: Record<number, { roundNumber: number; processed: boolean }>
}
```

**Example:**

```js
const { competitionState } = engine.getCompetitionState({ drawDefinition });

if (competitionState) {
  const participantIds = Object.keys(competitionState.participantStates);
  console.log(`Tracking ${participantIds.length} participants`);

  const processedRounds = Object.values(competitionState.roundStates)
    .filter((r) => r.processed)
    .map((r) => r.roundNumber);
  console.log(`Processed rounds: ${processedRounds}`);
}
```

**Notes:**

- Returns `undefined` for `competitionState` if no state has been initialized
- Read-only; does not modify the draw definition

---

### getCompetitionPolicy

Retrieves the `POLICY_TYPE_COMPETITION` policy applied to a draw, event, or tournament. The competition policy governs rating calculations, victory conditions, and leaderboard sorting.

**Parameters:**

```ts
{
  tournamentRecord?: Tournament;   // Optional - checked for applied policies
  drawDefinition?: DrawDefinition; // Optional - checked for applied policies
  event?: Event;                   // Optional - checked for applied policies
}
```

**Returns:**

```ts
{
  competitionPolicy?: CompetitionPolicy;
  // CompetitionPolicy contains ratingPolicy, victoryPolicy, etc.
}
```

**Example:**

```js
const { competitionPolicy } = engine.getCompetitionPolicy({
  tournamentRecord,
  drawDefinition,
  event,
});

if (competitionPolicy) {
  console.log(competitionPolicy.ratingPolicy.dynamicFormRating.kFactor);
  console.log(competitionPolicy.victoryPolicy.primaryRanking);
}
```

**Notes:**

- Uses the standard applied policies resolution chain (draw -> event -> tournament)
- Returns `undefined` for `competitionPolicy` if no competition policy is applied

---

### getCompetitionLeaderboard

Returns a sorted leaderboard of all participants in the competition, ranked according to the policy's `primaryRanking` criterion and tiebreak rules.

**Parameters:**

```ts
{
  tournamentRecord?: Tournament;   // Optional - for policy resolution
  drawDefinition: DrawDefinition;  // Required - draw containing competition state
  event?: Event;                   // Optional - for policy resolution
}
```

**Returns:**

```ts
{
  leaderboard?: CompetitionLeaderboardRow[];
  // Each row contains:
  //   participantId: string
  //   rank: number
  //   baselineRating: number
  //   dynamicFormRating: number
  //   pressureRating: number
  //   wins: number
  //   losses: number
  //   draws: number
  //   pointsWon: number
  //   pointsLost: number
}
```

**Example:**

```js
const { leaderboard } = engine.getCompetitionLeaderboard({
  tournamentRecord,
  drawDefinition,
  event,
});

for (const row of leaderboard) {
  console.log(`#${row.rank} ${row.participantId}: ${row.wins}W-${row.losses}L (form: ${row.dynamicFormRating})`);
}
```

**Notes:**

- Primary ranking options: `PRESSURE_RATING`, `DYNAMIC_FORM_RATING`, `WINS`, `POINTS`
- Tiebreak methods (applied in policy-defined order): `POINT_DIFFERENTIAL`, `DYNAMIC_FORM_RATING`, `PRESSURE_RATING`, `HEAD_TO_HEAD`, `HEAD_TO_HEAD_PRESSURE`, `STRENGTH_OF_OPPOSITION`
- Returns an empty array if competition state or policy is not present

---

### getCompetitionParticipantState

Retrieves the competition state for a single participant, including ratings, win/loss record, and rating history.

**Parameters:**

```ts
{
  drawDefinition: DrawDefinition;  // Required - draw containing competition state
  participantId: string;           // Required - participant to look up
}
```

**Returns:**

```ts
{
  participantState?: CompetitionParticipantState;
  // CompetitionParticipantState contains:
  //   participantId: string
  //   baselineRating: number
  //   dynamicFormRating: number
  //   pressureRating: number
  //   roundsPlayed: number
  //   wins: number
  //   losses: number
  //   draws: number
  //   totalPointsWon: number
  //   totalPointsLost: number
  //   ratingHistory: RatingHistoryEntry[]
}
```

**Example:**

```js
const { participantState } = engine.getCompetitionParticipantState({
  drawDefinition,
  participantId: 'p1',
});

if (participantState) {
  console.log(`Rating: ${participantState.dynamicFormRating}`);
  console.log(`Record: ${participantState.wins}-${participantState.losses}`);
  console.log(`Pressure: ${participantState.pressureRating}`);
  console.log(`Matches: ${participantState.ratingHistory.length}`);
}
```

**Notes:**

- Returns `undefined` for `participantState` if competition state is not initialized or participant is not found
- Rating history entries include per-matchUp details: opponent, rating before/after, pressure delta, actual vs expected output

---
