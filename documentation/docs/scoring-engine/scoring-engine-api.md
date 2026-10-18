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

A point added after the match is `COMPLETED` is not refused, and it does not change the score
(since 7.5.0). Since 7.7.0 nothing records it either: no history entry (so `undo` cannot pop it), no
`onPoint` event, and its `penaltyType` is not stamped on the last point played. The same holds for a
point that names no winner. To add a penalty or a note to a point already played, use
[decoratePoint](#decoratepoint) or [editPoint](#editpoint).

The timeline records every input the call supplied, including fields beyond `AddPointOptions` that a
host passes as decorations, so a rebuild (`undo`, `redo`, `editPoint`, `removePoint`) replays the
point exactly as recorded: its `scoreValue`, its `wrongSide`/`wrongServer`/`penaltyPoint` flags and
its decorations survive. A server the engine calculated is not an input and is not recorded; a
rebuild derives it again. Nor is any other field the scorer calculates (`serveSide`, `score`,
`pointNumber`, the points-to fields): passed in, it is overwritten on the point and left out of the
timeline.

An input the scorer cannot take is refused with an error before anything is written (no point, no
timeline entry, no event): a `winner` other than 0 or 1, a `winningSide` other than 1 or 2, the two
spellings of a side naming different sides (likewise `server`/`serverSideNumber`), or a `scoreValue`
that is negative or not finite. A zero `scoreValue` is allowed. A point that names no winner is
ignored, as before.

**What the engine records about service.** The server is side-level. `serverParticipantId` is host
metadata, recorded as given and never validated or derived. `serveSide` is the _expected_ court half,
inferred from the score (a No-Ad deciding point, where the receiver chooses, is still reported as
`deuce`). A caller that saw the court half supplies it as `observedServeSide` (`'deuce'` or `'ad'`),
recorded beside the expected `serveSide`. `wrongSide` and `wrongServer` are host decorations that do
not affect scoring. A server
correction (`setServer`) flips the side due to serve from that point on. An individual doubles
rotation, receiver identity and rule-based corrections (ITF Rule 27) are not modelled.

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

  // Host-owned service metadata
  serverParticipantId?: string; // Recorded without identity/rotation validation
  observedServeSide?: 'deuce' | 'ad'; // Observed half, beside derived serveSide

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
  currentSetScore: { side1Score: 2, side2Score: 1 },
  currentGameScore: { side1Points: 2, side2Points: 1 }, // 30-15
});
```

The initial score is an action on the timeline. A rebuild replays it where it was set, so it
survives `setState` without a `loadSupplementaryState`, and `undo` removes it like any other action.

---

## State Management

### setState

```ts
setState(matchUp: MatchUp): void
```

Load matchUp state from a CODES MatchUp JSON object. Replaces all internal state, clears redo stack.
The engine keeps a copy, so changing the object afterwards does not change the engine; `setLineUp`
and `setPointMultipliers` copy their arguments the same way, and `getPointMultipliers` and
`getSupplementaryState` return copies.
The initial lineups a rebuild starts from are the matchUp's lineups with its substitutions undone
(since 7.7.0); `loadSupplementaryState` replaces them with the saved snapshot.

```js
const savedMatchUp = JSON.parse(localStorage.getItem('matchUp'));
engine.setState(savedMatchUp);
```

---

### getState

```ts
getState(): MatchUp
```

Get current matchUp state as a CODES MatchUp object. Returns a deep copy: changing it does not change
the engine.

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

Get the current score as a structured object with sets, current game score, and set scores. Returns a
copy: changing it does not change the engine.

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

### getInputLevels

```ts
getInputLevels(): { point: boolean; game: boolean; set: boolean }
```

The inputs the set in play can be scored with: points, games, or set totals (`addSet`). `addPoint` and
`addGame` refuse an input this reports as unavailable, and throw before recording anything. A segment
of outs takes set totals only (see [Input Levels](./format-support#input-levels)).

```js
const engine = new ScoringEngine({ matchUpFormat: 'INN4XA-S:O3' });
engine.getInputLevels(); // { point: false, game: false, set: true }
engine.addSet({ side1Score: 2, side2Score: 1 }); // an inning's runs
```

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
const set1Stats = engine.getStatistics({ setFilter: 0 });
```

---

### getEpisodes

```ts
getEpisodes(): Episode[]
```

Get the point history enriched with game/set/match context. Each episode contains point data plus game boundaries, set boundaries, and next server information. Suitable for timeline visualization and detailed analysis.

```js
const episodes = engine.getEpisodes();
// [{ action, point, game, set, needed, nextService, result, complete }, ...]
// point: { index, number, winner, server, score, result }
// game: { index, isTiebreak, complete, winner }; set: { index, complete, winner }
```

---

### getNextServer

```ts
getNextServer(): 0 | 1
```

Get who serves the next point. Uses format-driven server alternation by default, or `WINNER_SERVES` if set in the competition format.

A point added without a server is recorded with the server this method returns, so the displayed,
recorded and replayed servers agree under either rule. A server the caller supplies is recorded as
played, and the rule resumes after it.

---

## Point Decoration & Editing

### decoratePoint

```ts
decoratePoint(pointIndex: number, metadata: Record<string, any>): void
```

Attach additional metadata to a point in history. Any point can be decorated, including after the
match is `COMPLETED`: a `penaltyType` or an annotation is a correction to the record, not a point
played. Since 7.7.0 the metadata is kept through every later rebuild of the score (`undo`, `redo`,
`editPoint`, `removePoint`).

```js
engine.decoratePoint(0, { courtPosition: 'deuce', shotType: 'forehand' });
engine.decoratePoint(12, { penaltyType: 'BALL_ABUSE', annotation: 'racquet thrown' });
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

Edit a point in history. By default, recalculates the score from the edited point forward. Any
point can be edited, including after the match is `COMPLETED`. Since 7.7.0 every field given is kept
through later rebuilds (before, a recalculating edit kept only `winner` and `server`, and dropped
decorations on other points), `penaltyType` can be set, and a winner given as `winningSide` takes
effect as one given as `winner` does. With `recalculate: false` the score is left as it was; the
next rebuild applies the edit.

```js
// Record a penalty against a point after the match
engine.editPoint(5, { penaltyType: 'COACHING' });

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

**Deprecated, removed in the next major.** Records the game index on its set's `hardBoundaries` as an
annotation only. Recalculation does not respect it: an edit before it still changes what follows, and a
rebuild (`undo`, `redo`, `editPoint`, `removePoint`) discards it.

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

Get engine-private state for persistence: data that isn't part of `getState()` but is needed to fully
restore the engine. The envelope carries a `version` (1), the redo stack, the initial lineup
snapshots, and the scoring configuration the history was scored under: the `competitionFormat` and
the `pointMultipliers`.

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

A saved `competitionFormat` and `pointMultipliers` replace the ones the engine was constructed
with: they are what the history was scored under, so a rebuild scores it the same way. An envelope
saved before the version field carries neither, and the engine keeps its own.

```js
const matchUp = JSON.parse(localStorage.getItem('matchUp'));
const supplementary = JSON.parse(localStorage.getItem('supplementary'));

engine.setState(matchUp);
engine.loadSupplementaryState(supplementary);

// Redo stack, lineups and scoring configuration are now restored
engine.canRedo(); // true (if there were undone actions)
```

---

## Service correction

### setServer

```ts
setServer(side: 0 | 1, options?: { recordEntry?: boolean }): void
```

Correct the side serving the next point (zero-based). Earlier recorded servers stay unchanged. By
default this records a timeline action, clears redo and survives rebuilding/undo/redo. Internal
rule-driven corrections can use `recordEntry: false`; that change is not an independently undoable
action. Without a parsed format it returns without changing state. This typed API does not validate
arbitrary JavaScript side values. It corrects sides, not individual doubles rotation.

Tennis tiebreak derivation uses one point for the first server, then alternating two-point turns.
The applicable final-set format is resolved independently; do not apply the opening-set service
pattern to a different final-set tiebreak. `setServer(1)` means side 2 should serve next.

## Additional statistics

### getStatObjects

```ts
getStatObjects(options?: StatisticsOptions): StatObject[]
```

Returns display-ready objects converted from `getStatistics(options)`, with the same zero-based
`setFilter`. It calculates a result without adding an undo action. Import the published `StatObject`
type rather than a local display shape.

## Lineups and substitution

### setLineUp

```ts
setLineUp(sideNumber: 1 | 2, lineUp: TeamCompetitor[]): void
```

Sets a side's starting lineup and its rebuild snapshot. The side number is one-based. This is setup,
not a timeline action; establish it before recording substitutions/points. Unknown sides do not gain
an on-court lineup. The input's competitor objects are shallow-copied.

### substitute

```ts
substitute(options: {
  sideNumber: 1 | 2; outParticipantId: string; inParticipantId: string; timestamp?: string;
}): SubstitutionResult
```

Returns `{ success: true }` after replacing an on-court participant and recording a pre-point timeline
action, or `{ success: false, error }` with `SAME_PARTICIPANT`, `NO_LINEUP`, `OUT_NOT_ON_SIDE` or
`IN_ALREADY_ON_COURT`. Refusal does not record an action or clear redo. Accepted substitutions clear
redo and are restored by timeline replay. See [substitution integration](./event-handlers.md#making-substitutions).

### evaluateSubstitution

```ts
evaluateSubstitution(): { violations: SubstitutionViolation[] }
```

Advisory evaluation of configured permission, match/segment limits, between-game timing and matchUp
type. Possible values are `NOT_ALLOWED`, `MAX_PER_MATCHUP`, `MAX_PER_SEGMENT`, `TIMING`, `MATCHUP_TYPE`.
It neither writes history nor vetoes `substitute`; hosts enforce roster/time rules the scorer cannot
observe. No configured rules yields an empty list.

### getActivePlayers

```ts
getActivePlayers(): { side1: string[]; side2: string[] }
```

Returns current lineup participant IDs (empty arrays without lineups). No history action. See
[event handlers and integration](./event-handlers.md) for tracking active players on points.

## Multipliers and profiles

### setPointMultipliers

```ts
setPointMultipliers(multipliers: PointMultiplier[]): void
```

Replaces scoring configuration with a deep copy. No timeline action and no immediate rescore. Persist
configuration with supplementary state; keep the configuration consistent when replaying history.

### getPointMultipliers

```ts
getPointMultipliers(): PointMultiplier[]
```

Returns a deep copy; editing it does not configure the scorer. Neither getter nor setter is an undo step.

### getPenaltyProfile

```ts
getPenaltyProfile(): PenaltyProfile | undefined
```

### getPointProfile

```ts
getPointProfile(): PointProfile | undefined
```

### getTimerProfile

```ts
getTimerProfile(): TimerProfile | undefined
```

### getTimeoutRules

```ts
getTimeoutRules(): TimeoutRules | undefined
```

### getPenaltyBoxProfile

```ts
getPenaltyBoxProfile(): PenaltyBoxProfile | undefined
```

### getSubstitutionRules

```ts
getSubstitutionRules(): SubstitutionRules | undefined
```

### getPlayerRules

```ts
getPlayerRules(): PlayerRules | undefined
```

These seven accessors return the corresponding configured competition-format object, or `undefined`
if absent. They do not validate or execute its rules, throw on absence, or create undo actions. They
currently expose those configuration references: treat them as read-only. Host clocks, timeouts,
penalty-box timing and roster enforcement remain host responsibilities. See
[format support](./format-support.md) and [event integration](./event-handlers.md).

## Runtime handlers

### setEventHandlers

```ts
setEventHandlers(handlers: ScoringEventHandlers | undefined): void
```

Replaces all handlers; pass `undefined` to clear them. Callback registration is not part of undo/redo
or serializable scoring state.

### getEventHandlers

```ts
getEventHandlers(): ScoringEventHandlers | undefined
```

Returns the currently installed handler object (a reference). Neither method emits a scoring event.
See the [dispatch matrix](./event-handlers.md#handler-descriptions) for when callbacks run.

`StatisticsOptions.setFilter`, episode point/game/set indices and stored point indices are zero-based. The first set is `setFilter: 0`; CODES `winningSide` remains one-based.

## Related Documentation

- **[Overview](./scoring-engine-overview.md)** — Introduction and architecture
- **[Event Handlers & Integration](./event-handlers.md)** — Event system and competitionFormat profiles
- **[Multi-Sport Format Support](./format-support.md)** — Format strings for different sports
- **[Visualization Applications](./visualization-applications.md)** — Building visualizations with ScoringEngine data
