---
title: Core API Reference
---

Complete method reference for the `ScoringEngine` class.

:::info
The ScoringEngine supports **two indexing conventions** for `addPoint()`:

- **0-based** (original): `winner: 0 | 1`, `server: 0 | 1` — where `0` = side 1, `1` = side 2
- **1-based** ([CODES](/docs/data-standards#codes)-aligned): `winningSide: 1 | 2`, `serverSideNumber: 1 | 2`

You can use either convention, or both when they name the same side (two spellings that disagree are refused). Both values are always stored on the resulting `Point` record. Return values like `getWinner()` use CODES convention (1 or 2).
:::

## Scoring Methods

### addPoint

```ts
addPoint(options: AddPointOptions): ScoringActionResult
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
ignored, as before. A `scoreValue` other than 1 is refused where a point is not a unit of the score:
in a set whose points build games (a standard set, a tennis-family timed set, the tiebreak a level
timed set plays at time) and in a combined total. A configured point multiplier is not consulted
there either.

**The result.** `addPoint`, `addGame`, `addSet` and `endSegment` return `{ recorded: true }`, or
`{ recorded: false, ignored }` for an input the engine accepted and recorded nothing for: `NO_WINNER`
(a point naming no winner), `MATCH_COMPLETED` (any input after the match is `COMPLETED`),
`NO_SET_BEYOND_N` (input past the N sets of an exactly format) and `TIEBREAK_IN_PLAY` (a segment end
during the tiebreak at time). A refusal throws and also writes nothing. Ignored input keeps the redo
stack; every recorded action clears it.

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
Provide `winner` or `winningSide`, or both when they name the same side; spellings that disagree are refused. The engine normalizes internally — the resulting `Point` record always contains both `winner` and `winningSide`. The same applies to `server` / `serverSideNumber`.
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
addGame(options: AddGameOptions): ScoringActionResult
```

Add a complete game result. Used for game-by-game tracking without point detail. `winner` must be 0
or 1 and a `tiebreakScore` two non-negative integers. A game after a closed set (won, or a timed
segment ended level) opens the next set, as a point does. In a tiebreak-only set (`SET3-S:TB11`, or
a match tiebreak in lieu of the final set) a game is the set won 1-0, its `tiebreakScore` the points,
which must win the race to the set's target for `winner` (11-9 in `SET3-S:TB11`; 11-10 is refused).

```js
engine.addGame({ winner: 0 }); // Side 1 wins a game
engine.addGame({ winner: 1, tiebreakScore: [7, 5] }); // Side 2 wins tiebreak 7-5
```

---

### addSet

```ts
addSet(options: AddSetOptions): ScoringActionResult
```

Add a set total. Used by scoring modals where users enter set scores directly. The total is judged by
the rule of the set it is entered for:

- a total the rule calls finished is recorded with the rule's winner (6-4, 7-6, 7-5; a tiebreak-only
  set read from its points; a timed total is a finished segment, the side with more winning it);
- an explicit `winningSide` naming the loser of a finished total, or a side that is not ahead, is
  refused;
- an explicit `winningSide` for the side ahead on an unfinished total is accepted: a set-level mercy
  or manual end;
- an unfinished total with no winner (3-1, 6-5 in a set to six) is recorded as the set in play.

A total entered while a set is in play (points or games already recorded in it) closes that set with
the declared total; its points stay on the history and scoring continues in the next set.

```js
engine.addSet({ side1Score: 6, side2Score: 4 }); // 6-4
engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 }); // 7-6(3)
engine.addSet({ side1Score: 3, side2Score: 6 }); // 3-6, won by side 2
engine.addSet({ side1Score: 4, side2Score: 1, winningSide: 1 }); // a manual end at 4-1
```

---

### endSegment

```ts
endSegment(options?: EndSegmentOptions): ScoringActionResult
```

End a timed segment. For timed formats (`S:T10P`, etc.), this finalizes the segment's score and checks
match completion. It ends timed segments only: it is refused on any other kind of set, on a segment
already closed, and when there is no timed segment to end. A set-level mercy or manual end is `addSet`
with an explicit `winningSide`; a match-level stop is a `matchUpStatus` set outside scoring. During
the tiebreak a level segment plays at time it is ignored. `reason` is a free host string, recorded and
never interpreted.

```js
engine.endSegment(); // End current segment
engine.endSegment({ setNumber: 2 }); // End specific segment
engine.endSegment({ reason: 'bolt_expired' });
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

Its sets are judged by their set's rule, as `addSet` judges a total: 6-5 is not won, the deciding set
is judged by the final-set format, and a tiebreak-only set is read from its points. A baseline that
decides the match completes it. An unfinished last set is the set in play. A supplied `server` is
recorded as a server correction at the baseline, so it survives undo and rebuild. A second baseline
is refused once the timeline holds scoring; a correction uses `editPoint`, `removePoint` or `undo`.
A `matchUpStatus` or `winningSide` passed beside the sets is checked against them and refused only
when they disagree; a status set outside scoring (`RETIRED`, `DEFAULTED`) is not checked.

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

Undo the last N actions. Works across all input types (points, games, sets, segments). Returns `true` if undo succeeded; `false` when there is nothing to undo or `count` is below 1.

```js
engine.undo(); // Undo last action
engine.undo(3); // Undo last 3 actions
```

---

### redo

```ts
redo(count?: number): boolean
```

Redo the last N undone actions. Returns `true` if redo succeeded; `false` when there is nothing to redo or `count` is below 1.

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

`decisionRequired` is `true` when the match is `COMPLETED` without a winner: a timed, aggregate or
exactly-N match that ended level with no declared decider, or a combined-total tie. The `situation`
of such a match has every flag false and `decisionRequired: true`; a host running an elimination draw
decides the match outside scoring.

---

### getScoreboard

```ts
getScoreboard(options?: GetScoreboardOptions): string
```

Get the score as a display string. The game in play is read by the format governing the set in play:
tennis points in a game, numeric points in a tiebreak-only set, a match tiebreak, a set tiebreak, the
tiebreak a level timed segment plays at time, and a consecutive-points game.

```js
engine.getScoreboard(); // '6-4, 3-6, 2-1 (30-15)'
// SET3-S:TB11 at 5-3 in the first game
engine.getScoreboard(); // '0-0 (5-3)'
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

Check if the match is complete. A match that ended level with no declared decider is complete with no
winner (`getWinner()` is `undefined`), and takes no further segment.

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

### getSetInPlayFormat

```ts
getSetInPlayFormat(): SetFormatStructure | undefined
```

The format governing the set in play: the final-set format (`-F:`) in the live deciding set, the ordinary set
format otherwise. It is the format the engine judges the next point, game or set total by, so a scorer that
offers inputs (hiding a game control in a tiebreak-only segment, posting a winning set total) reads it here
rather than re-deriving which set is the decider. The rule covers best-of formats (the deciding set is reached
when both sides are one set from winning), exactly formats (set N) and aggregate formats with a declared decider
(set N + 1). Returns `undefined` if the format string is invalid. Once the match is complete it is the format a
further set would take; the engine records no further input.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
engine.getSetInPlayFormat(); // { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } }
engine.addSet({ side1Score: 6, side2Score: 3 });
engine.addSet({ side1Score: 3, side2Score: 6 });
engine.getSetInPlayFormat(); // { tiebreakSet: { tiebreakTo: 10 } }: the match tiebreak
```

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

Get the input mode based on what types of scoring inputs have been recorded: points, games and set
totals. Baselines, segment ends, server corrections, substitutions, challenges and annotations are not
inputs.

```js
engine.setServer(1);
engine.getInputMode(); // 'none'

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

The format's rule: game by game in standard sets, with Rule 5(b) in a tiebreak (a tennis match
tiebreak included); unit by unit in timed segments, continuously across segments, with Rule 5(b) in a
tiebreak at time; and under `@RALLY` the winner of the point before. A combined total (`P{n}`) and a
tiebreak-only format (`S:TB{n}`) derive no server: this method still returns 0 or 1 there, a
placeholder (the side the last `setServer` named, or side 1), and points record a server only when
the caller supplies one. `isServerDerived()` says which it is.

---

### isServerDerived

```ts
isServerDerived(): boolean
```

Whether `getNextServer()` is the engine's derivation (`true`) or only a placeholder (`false`: a
combined total, a tiebreak-only format until each sport's own service rule is added, and a completed
match, which has no next point). The score
situation carries the same answer as `serverDerived`; where it is `false`, no game point or break
point is reported and no server-based statistic is produced.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });
engine.isServerDerived(); // false
```

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

### getLegacyShapes

```ts
getLegacyShapes(): string[]
```

The legacy shapes the last rebuild met. A stored timeline that scored past a level close, as earlier
versions did, replays as it was scored and reports `scoringPastLevelClose`; the
rule applies to new input only. Likewise a stored entry the engine now refuses (invalid facts, a
segment end on a set that is not timed or is closed, a `scoreValue` where a point is not a unit, a
second baseline) reports `refusedInput`, and one it now ignores (input after `COMPLETED` or past N)
reports `ignoredInput`; each replays as it was recorded.

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
rule-driven corrections can use `recordEntry: false`: the correction is then attached to the entry
before it (the point just played), replayed with it and undone with it, so `undo` takes back the
point and its correction together and a rebuild keeps the server. With nothing on the timeline before
it, it is the match's initial server: kept on the record as `history.initialServer` (not a timeline
entry), so every rebuild and reload starts from it. Under `serverRule: 'WINNER_SERVES'` a correction
names the next point's server only, and the winner of that point serves after it. A correction that changes nothing records nothing. A side other
than 0 or 1 is refused, and so is any call on a format that does not parse. It corrects sides, not
individual doubles rotation.

Tennis tiebreak derivation uses one point for the first server, then alternating two-point turns.
The applicable final-set format is resolved independently; do not apply the opening-set service
pattern to a different final-set tiebreak. `setServer(1)` means side 2 should serve next.

## Challenges and annotations

### addChallenge

```ts
addChallenge(options: { sideNumber: 1 | 2; timestamp?: string; [key: string]: any }): void
```

Record a challenge: the side that challenged and any host fields, as a timeline entry
`{ type: 'challenge', data: { sideNumber, ... } }`. It changes no score, is kept through every rebuild,
clears redo, and `undo` takes it back when it was recorded last. A challenge entry a host wrote onto the
timeline itself in that shape is read the same way. A `sideNumber` other than 1 or 2 is refused.

### addAnnotation

```ts
addAnnotation(data: Record<string, any>, options?: { timestamp?: string }): void
```

Record host data on the timeline (`{ type: 'annotation', data }`). It changes no score and is kept and
undone like a challenge.

---

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

Replaces scoring configuration with a deep copy. No timeline action and no immediate rescore: the new
multipliers value the points recorded from then on. A point keeps the value it was scored at, which its
entry records, so an undo, a redo or a reload does not re-value earlier points. Persist configuration with
supplementary state.

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
