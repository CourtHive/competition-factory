---
title: Core API Reference
---

Complete method reference for the `ScoringEngine` class.

:::info
The ScoringEngine supports **two indexing conventions** for `addPoint()`:

- **0-based** (original): `winner: 0 | 1`, `server: 0 | 1` — where `0` = side 1, `1` = side 2
- **1-based** ([CODES](/docs/data-standards#codes)-aligned): `winningSide: 1 | 2`, `serverSideNumber: 1 | 2`

You can use either convention. Provide `winner` **or** `winningSide` (not both). Both values are always stored on the resulting `Point` record. Return values like `getWinner()` use CODES convention (1 or 2).
:::

## Scoring Methods

### addPoint

```ts
addPoint(options: AddPointOptions): void
```

Add a point to the match. This is the primary input method for point-by-point scoring.

```js
// 0-based convention
engine.addPoint({ winner: 0 }); // Side 1 wins the point
engine.addPoint({ winner: 1, server: 0 }); // Side 2 wins, side 1 served

// 1-based convention (CODES-aligned)
engine.addPoint({ winningSide: 1 }); // Side 1 wins the point
engine.addPoint({ winningSide: 2, serverSideNumber: 1 }); // Side 2 wins, side 1 served

// With metadata (works with either convention)
engine.addPoint({ winner: 0, result: 'Ace' }); // Side 1 wins with an ace
engine.addPoint({ winningSide: 2, rallyLength: 12 }); // Side 2 wins after 12-shot rally
engine.addPoint({ winner: 0, timestamp: new Date().toISOString() });

// Doubles with specific server
engine.addPoint({ winningSide: 1, serverSideNumber: 1, serverParticipantId: 'player-A' });

// Override point value (e.g., power points in timed formats)
engine.addPoint({ winningSide: 1, scoreValue: 2 }); // Worth 2 points instead of 1
```

The `AddPointOptions` interface:

```ts
interface AddPointOptions {
  // 0-based convention
  winner?: 0 | 1; // Which side won (0 = side 1, 1 = side 2)
  server?: 0 | 1; // Which side served (auto-derived if omitted)

  // 1-based convention (CODES-aligned)
  winningSide?: 1 | 2; // Which side won (1 = side 1, 2 = side 2)
  serverSideNumber?: 1 | 2; // Which side served

  // Doubles rotation
  serverParticipantId?: string; // Specific participant serving

  // Score override
  scoreValue?: number; // Override score increment (default: 1)

  // Metadata
  timestamp?: string; // ISO timestamp
  rallyLength?: number; // Number of shots in the rally
  result?: string; // Point result label (e.g., 'Ace', 'Double Fault')
  penaltyType?: string; // Penalty type if point was awarded via penalty
  penaltyPoint?: boolean; // Whether this was a penalty point
  wrongSide?: boolean; // Tracking flag for wrong-side serve
  wrongServer?: boolean; // Tracking flag for wrong server
}
```

:::tip
Provide `winner` **or** `winningSide`, not both. The engine normalizes internally — the resulting `Point` record always contains both `winner` and `winningSide`. The same applies to `server` / `serverSideNumber`.
:::

#### Stored Point Record

After `addPoint()`, the resulting `Point` in `matchUp.history.points` always contains both indexing conventions regardless of which was passed in:

```ts
interface Point {
  pointNumber: number; // Sequential (1-indexed)
  winner: 0 | 1; // Always set
  winningSide: 1 | 2; // Always set
  server?: 0 | 1; // Set if server was provided or derived
  serverSideNumber?: 1 | 2; // Set if server was provided or derived
  serverParticipantId?: string; // Set if provided (doubles)
  scoreValue?: number; // Set if override was provided
  timestamp?: string; // ISO 8601
  activePlayers?: [string, string] | [string[], string[]]; // Set if lineups exist
  // ... plus result, rallyLength, serve metadata, etc.
}
```

---

### addGame

```ts
addGame(options: AddGameOptions): void
```

Add a complete game result. Used for game-by-game tracking without point detail.

```js
engine.addGame({ winner: 0 }); // Side 1 wins a game
engine.addGame({ winner: 1, tiebreakScore: [7, 5] }); // Side 2 wins tiebreak 7-5
```

---

### addSet

```ts
addSet(options: AddSetOptions): void
```

Add a complete set score. Used by scoring modals where users enter finished set scores directly.

```js
engine.addSet({ side1Score: 6, side2Score: 4 }); // 6-4
engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 }); // 7-6(3)
engine.addSet({ side1Score: 3, side2Score: 6, winningSide: 2 }); // Explicit winner
```

---

### endSegment

```ts
endSegment(options?: EndSegmentOptions): void
```

End a timed segment/period. For timed formats (`S:T10P`, etc.), this finalizes the current set's score and checks match completion.

```js
engine.endSegment(); // End current segment
engine.endSegment({ setNumber: 2 }); // End specific segment
```

---

### setInitialScore

```ts
setInitialScore(options: InitialScoreOptions): void
```

Set the score before beginning point-by-point tracking. Used when a tracker arrives mid-match.

```js
engine.setInitialScore({
  sets: [
    { side1Score: 6, side2Score: 3 },
    { side1Score: 4, side2Score: 6 },
  ],
  currentSet: { side1Score: 2, side2Score: 1 },
  currentGame: { side1Score: 30, side2Score: 15 },
});
```

---

## State Management

### setState

```ts
setState(matchUp: MatchUp): void
```

Load matchUp state from a CODES MatchUp JSON object. Replaces all internal state, clears redo stack.

```js
const savedMatchUp = JSON.parse(localStorage.getItem('matchUp'));
engine.setState(savedMatchUp);
```

---

### getState

```ts
getState(): MatchUp
```

Get current matchUp state as a CODES MatchUp object. Returns a direct reference (not a copy).

```js
const matchUp = engine.getState();
localStorage.setItem('matchUp', JSON.stringify(matchUp));
```

---

### reset

```ts
reset(): void
```

Reset match to initial state. Clears all points, entries, undo/redo stacks, and lineups.

```js
engine.reset();
engine.getPointCount(); // 0
engine.isComplete(); // false
```

---

## Undo / Redo

### undo

```ts
undo(count?: number): boolean
```

Undo the last N actions. Works across all input types (points, games, sets, segments). Returns `true` if undo succeeded.

```js
engine.undo(); // Undo last action
engine.undo(3); // Undo last 3 actions
```

---

### redo

```ts
redo(count?: number): boolean
```

Redo the last N undone actions. Returns `true` if redo succeeded.

```js
engine.redo(); // Redo last undone action
engine.redo(2); // Redo last 2 undone actions
```

---

### canUndo

```ts
canUndo(): boolean
```

Check if there are actions available to undo.

---

### canRedo

```ts
canRedo(): boolean
```

Check if there are actions available to redo.

---

### getUndoDepth

```ts
getUndoDepth(): number
```

Get the number of actions that can be undone.

---

### getRedoDepth

```ts
getRedoDepth(): number
```

Get the number of actions that can be redone.

---

## Score Queries

### getScore

```ts
getScore(): ScoreResult
```

Get the current score as a structured object with sets, current game score, and set scores.

```js
const score = engine.getScore();
// { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }, ...], ... }
```

---

### getScoreboard

```ts
getScoreboard(options?: GetScoreboardOptions): string
```

Get the score as a display string.

```js
engine.getScoreboard(); // '6-4 3-6 2-1 30-15'
```

---

### getWinner

```ts
getWinner(): number | undefined
```

Get the match winner. Returns `1` (side 1) or `2` (side 2), or `undefined` if not complete.

---

### isComplete

```ts
isComplete(): boolean
```

Check if the match is complete.

---

### getPointCount

```ts
getPointCount(): number
```

Get the total number of points played.

---

### getFormat

```ts
getFormat(): string
```

Get the matchUpFormat code string.

```js
engine.getFormat(); // 'SET3-S:6/TB7'
```

---

## Format Introspection

### isNoAd

```ts
isNoAd(): boolean
```

Whether the format uses No-Advantage scoring (deciding point at deuce).

---

### getSetsToWin

```ts
getSetsToWin(): number
```

Number of sets needed to win the match.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7' });
engine.getSetsToWin(); // 3
```

---

### getTiebreakAt

```ts
getTiebreakAt(): number | null
```

Game count at which a tiebreak is played, or `null` if no tiebreak. Returns `null` for tiebreak-only formats (pickleball, etc.) since the entire set IS the tiebreak.

---

### hasFinalSetTiebreak

```ts
hasFinalSetTiebreak(): boolean
```

Whether a tiebreak is played in the final/deciding set.

---

### getFormatStructure

```ts
getFormatStructure(): FormatStructure | undefined
```

Get the parsed format structure for advanced consumers. Returns `undefined` if the format string is invalid.

---

### getInputMode

```ts
getInputMode(): 'points' | 'games' | 'sets' | 'mixed' | 'none'
```

Get the input mode based on what types of entries have been recorded.

```js
engine.addPoint({ winner: 0 });
engine.getInputMode(); // 'points'

engine.addGame({ winner: 1 });
engine.getInputMode(); // 'mixed'
```

---

## Statistics & Analysis

### getStatistics

```ts
getStatistics(options?: StatisticsOptions): MatchStatistics
```

Get match statistics calculated from point history. Returns counters, calculated stats, and summary.

```js
const stats = engine.getStatistics();
const set1Stats = engine.getStatistics({ setFilter: 1 });
```

---

### getEpisodes

```ts
getEpisodes(): Episode[]
```

Get the point history enriched with game/set/match context. Each episode contains point data plus game boundaries, set boundaries, and next server information. Suitable for timeline visualization and detailed analysis.

```js
const episodes = engine.getEpisodes();
// [{ point, gameScore, setScore, matchScore, gameNumber, setNumber, ... }, ...]
```

---

### getNextServer

```ts
getNextServer(): 0 | 1
```

Get who serves the next point. Uses format-driven server alternation by default, or `WINNER_SERVES` if set in the competition format.

---

## Point Decoration & Editing

### decoratePoint

```ts
decoratePoint(pointIndex: number, metadata: Record<string, any>): void
```

Attach additional metadata to a point in history.

```js
engine.decoratePoint(0, { courtPosition: 'deuce', shotType: 'forehand' });
```

---

### editPoint

```ts
editPoint(
  pointIndex: number,
  newData: Partial<AddPointOptions>,
  options?: { recalculate?: boolean }
): void
```

Edit a point in history. By default, recalculates the score from the edited point forward.

```js
// Fix a wrong winner call
engine.editPoint(5, { winner: 1 });

// Update metadata without recalculating
engine.editPoint(5, { result: 'Ace' }, { recalculate: false });
```

---

### markHardBoundary

```ts
markHardBoundary(options: { setIndex: number; gameIndex: number }): void
```

Mark a game boundary as "hard". Edits before this boundary won't cascade past it during recalculation.

```js
engine.markHardBoundary({ setIndex: 0, gameIndex: 4 });
```

---

### removePoint

```ts
removePoint(pointIndex: number, options?: { recalculate?: boolean }): void
```

Remove a point from history at any position — not just the most recent (which `undo` covers). The corresponding history entry is removed and `pointIndex` values on later entries are renormalised so they continue to match their new positions in `points`. Out-of-range indices are silently ignored.

By default, the score is rebuilt from history after removal and the redo stack is cleared. Pass `{ recalculate: false }` to splice the point out without re-deriving state — useful when you'll immediately follow with another mutation that triggers its own rebuild.

```js
// Remove a wrongly-recorded point in the middle of a game
engine.removePoint(5);

// Drop without recalculating (caller will rebuild)
engine.removePoint(5, { recalculate: false });
```

Use `removePoint` when the user intends to delete a specific historical point (e.g. a misclicked penalty in a long rally sequence); use `undo` when the user simply wants to step back the last action.

---

## Persistence

### getSupplementaryState

```ts
getSupplementaryState(): ScoringEngineSupplementaryState
```

Get engine-private state for persistence. Returns the redo stack and initial lineup snapshots — data that isn't part of `getState()` but is needed to fully restore the engine.

```js
const matchUp = engine.getState();
const supplementary = engine.getSupplementaryState();

// Save both
localStorage.setItem('matchUp', JSON.stringify(matchUp));
localStorage.setItem('supplementary', JSON.stringify(supplementary));
```

---

### loadSupplementaryState

```ts
loadSupplementaryState(state: ScoringEngineSupplementaryState): void
```

Restore engine-private state from persistence. Call after `setState()` to fully restore engine state.

```js
const matchUp = JSON.parse(localStorage.getItem('matchUp'));
const supplementary = JSON.parse(localStorage.getItem('supplementary'));

engine.setState(matchUp);
engine.loadSupplementaryState(supplementary);

// Redo stack and lineups are now restored
engine.canRedo(); // true (if there were undone actions)
```

---

## Related Documentation

- **[Overview](./scoring-engine-overview)** — Introduction and architecture
- **[Event Handlers & Integration](./event-handlers)** — Event system and competitionFormat profiles
- **[Multi-Sport Format Support](./format-support)** — Format strings for different sports
- **[Visualization Applications](./visualization-applications)** — Building visualizations with ScoringEngine data
