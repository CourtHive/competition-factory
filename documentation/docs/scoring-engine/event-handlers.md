---
title: Event Handlers & Integration
---

The ScoringEngine fires event handlers at key moments during scoring. These enable reactive UI updates, logging, analytics, and integration with external systems.

## Event Handlers

### Handler Interface

```ts
interface ScoringEventHandlers {
  onPoint?: (context: ScoringEventContext) => void;
  onGameComplete?: (context: ScoringEventContext & { gameWinner: 0 | 1 }) => void;
  onSetComplete?: (context: ScoringEventContext & { setWinner: 0 | 1 }) => void;
  onMatchTie?: (context: ScoringEventContext) => void;
  onMatchComplete?: (context: ScoringEventContext & { matchWinner: 0 | 1 }) => void;
  onUndo?: (context: ScoringEventContext) => void;
  onRedo?: (context: ScoringEventContext) => void;
  onReset?: (context: ScoringEventContext) => void;
}

interface ScoringEventContext {
  state: MatchUp;
  score: ScoreResult;
}
```

All handlers receive a `ScoringEventContext` containing the current matchUp state and score after the action completes. Handlers are called synchronously — keep them fast or dispatch async work.

### Setting Handlers

Handlers can be set at construction time or updated at runtime:

```js
// At construction
const engine = new ScoringEngine({
  matchUpFormat: 'SET3-S:6/TB7',
  eventHandlers: {
    onPoint: (ctx) => console.log('Point!', ctx.score),
    onMatchComplete: (ctx) => console.log('Match over!', ctx.state.winningSide),
  },
});

// At runtime
engine.setEventHandlers({
  onPoint: (ctx) => updateScoreboard(ctx.score),
  onGameComplete: ({ gameWinner }) => playGameAnimation(gameWinner),
  onSetComplete: ({ setWinner }) => playSetAnimation(setWinner),
  onMatchComplete: ({ matchWinner }) => showMatchResult(matchWinner),
  onUndo: (ctx) => updateScoreboard(ctx.score),
  onRedo: (ctx) => updateScoreboard(ctx.score),
});

// Get current handlers
const handlers = engine.getEventHandlers();

// Clear all handlers
engine.setEventHandlers(undefined);
```

### Handler Descriptions

| Handler           | Trigger                                                    | Extra context         |
| ----------------- | ---------------------------------------------------------- | --------------------- |
| `onPoint`         | A point is accepted and recorded                           | —                     |
| `onGameComplete`  | That point completes a game (not a combined-point segment) | `gameWinner: 0 \| 1`  |
| `onSetComplete`   | That point completes a set with a winner                   | `setWinner: 0 \| 1`   |
| `onMatchComplete` | That point completes a match with a winner                 | `matchWinner: 0 \| 1` |
| `onMatchTie`      | That point completes a match without a winner              | —                     |
| `onUndo`          | `undo()` succeeds                                          | —                     |
| `onRedo`          | `redo()` succeeds                                          | —                     |
| `onReset`         | `reset()` is called                                        | —                     |

| Input level/action                                       | Scoring completion dispatch                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Recorded `addPoint`                                      | Point, then any game/set completion, then match winner or tie               |
| Winnerless point, completed-match no-op, refused point   | No scoring callbacks                                                        |
| `addGame`, `addSet`, `endSegment`, `setInitialScore`     | Update state/history without the point-driven game/set/match callbacks      |
| `addGame`, `addSet`, `endSegment` that end a match level | `onMatchTie` only (a level close with no declared decider)                  |
| Undo/redo                                                | Their own callbacks; rebuilding does not re-emit historical point callbacks |

Use the returned state after aggregate input rather than relying on `onPoint` or completion handlers
to refresh the UI. A single accepted point can dispatch multiple callbacks in the listed order.

### Accepted points and no-ops

```ts
import { scoreGovernor } from 'tods-competition-factory';

const notifications: string[] = [];
const scorer = new scoreGovernor.ScoringEngine({
  matchUpFormat: 'SET1-S:TB1',
  eventHandlers: { onPoint: () => notifications.push('point') },
});
scorer.addPoint({}); // winnerless: no callback
scorer.addPoint({ winner: 0 }); // accepted, completes this one-point match
scorer.addPoint({ winner: 1 }); // completed-match no-op
// notifications is ['point']
```

### Example: Live Scoreboard

```js
const engine = new ScoringEngine({
  matchUpFormat: 'SET3-S:6/TB7',
  eventHandlers: {
    onPoint: ({ score }) => {
      renderScore(score);
      saveState(engine.getState());
    },
    onGameComplete: () => {
      playSound('game-complete');
    },
    onSetComplete: ({ setWinner }) => {
      showSetBanner(`Set won by ${setWinner === 0 ? 'Player 1' : 'Player 2'}`);
    },
    onMatchComplete: ({ matchWinner, state }) => {
      showMatchResult(state);
      submitFinalScore(state);
    },
    onUndo: ({ score }) => renderScore(score),
    onRedo: ({ score }) => renderScore(score),
  },
});
```

---

## competitionFormat Integration

The `competitionFormat` interface allows you to pass a full competition profile that goes beyond the matchUpFormat string. This is used by sports and organizations that need penalty profiles, timer configurations, substitution rules, and other gameplay metadata.

`competitionFormat` describes how a sport is played (timers, penalties and substitutions); the separate draw-level [`competitionProfile`](../concepts/draw-types/competition-profile.md) describes its competition format, such as Americano or Mexicano.

### Passing a competitionFormat

```js
const engine = new ScoringEngine({
  competitionFormat: {
    competitionFormatName: 'INTENNSE Doubles',
    matchUpFormat: 'SET3-S:TB11',
    sport: 'INTENNSE',
    timerProfile: {
      shotClockSeconds: 25,
      changeoverSeconds: 90,
    },
    penaltyProfile: {
      sport: 'INTENNSE',
      penaltyTypes: [
        { penaltyType: 'TIME_VIOLATION', label: 'Time Violation', category: 'delay' },
        { penaltyType: 'CODE_VIOLATION', label: 'Code Violation', category: 'conduct' },
      ],
      escalation: [
        { step: 1, consequence: 'WARNING' },
        { step: 2, consequence: 'POINT_PENALTY' },
        { step: 3, consequence: 'GAME_PENALTY' },
      ],
    },
    pointProfile: {
      sport: 'INTENNSE',
      pointResults: [
        { result: 'Ace', label: 'Ace', isServe: true },
        { result: 'Double Fault', label: 'Double Fault', isServe: true, isError: true },
        { result: 'Winner', label: 'Winner' },
        { result: 'Unforced Error', label: 'Unforced Error', isError: true },
      ],
      strokeTypes: ['forehand', 'backhand', 'volley', 'overhead', 'serve'],
    },
    substitutionRules: {
      allowed: true,
      maxPerMatchUp: 3,
      timing: 'BETWEEN_GAMES',
    },
    pointMultipliers: [{ condition: { result: 'Ace' }, multiplier: 2 }],
    serverRule: 'ALTERNATE_GAMES',
  },
});
```

A `penaltyProfile` names the penalty types of its own format, and they need not be [`PenaltyTypeEnum`](../enums.mdx) codes: `TIME_VIOLATION` is one, while `CODE_VIOLATION` is a value this INTENNSE profile defines for itself. Use an enum code where one fits, since that is the vocabulary a tournament record's penalties store and `@courthive/i18n` labels (`penalties.<CODE>`); the `label` in a profile entry is the format's own display text.

When a `competitionFormat` is provided, the engine automatically extracts the `matchUpFormat`, `pointMultipliers`, and `serverRule` from it.

### Profile Accessors

Access individual profiles from the competition format:

```js
// Penalty types and escalation rules
const penalties = engine.getPenaltyProfile();
// { sport: 'INTENNSE', penaltyTypes: [...], escalation: [...] }

// Point result types and stroke classifications
const points = engine.getPointProfile();
// { sport: 'INTENNSE', pointResults: [...], strokeTypes: [...] }

// Shot clock and changeover timers
const timers = engine.getTimerProfile();
// { shotClockSeconds: 25, changeoverSeconds: 90 }

// Timeout rules
const timeouts = engine.getTimeoutRules();
// { count: 2, per: 'SET', durationSeconds: 120 }

// Substitution rules
const subs = engine.getSubstitutionRules();
// { allowed: true, maxPerMatchUp: 3, timing: 'BETWEEN_GAMES' }

// Player rules (e.g., minutes per segment)
const playerRules = engine.getPlayerRules();
// { maxMinutesPerSegment: 10 }
```

All profile accessors return `undefined` if no `competitionFormat` was provided or if the specific profile is not defined in the format.

---

## Point Multipliers

Point multipliers allow conditional scaling of point values. This is useful for sports like INTENNSE where aces are worth 2x points.

### Setting Multipliers

```js
// Via constructor
const engine = new ScoringEngine({
  matchUpFormat: 'SET2XA-S:T10P',
  pointMultipliers: [{ condition: { result: 'Ace' }, multiplier: 2 }],
});

// Or at runtime
engine.setPointMultipliers([{ condition: { result: 'Ace' }, multiplier: 2 }]);

// Query current multipliers
const multipliers = engine.getPointMultipliers();
```

When `addPoint()` is called with a matching `result`, the multiplier is applied to the point value during score calculation.

---

## Substitutions & LineUps

The ScoringEngine tracks team lineups and substitutions for doubles or team formats.

### Setting Up LineUps

Register the players a side has on court before processing points. This enables substitution tracking and per-point active player snapshots. The lineUp is the players on court, not the team's roster: a reserve comes on by substitution.

```js
engine.setLineUp(1, [
  { participantId: 'player-A', participantName: 'Alice' },
  { participantId: 'player-B', participantName: 'Bob' },
]);

engine.setLineUp(2, [
  { participantId: 'player-C', participantName: 'Carol' },
  { participantId: 'player-D', participantName: 'Dave' },
]);
```

The initial lineup is saved internally so the engine can reconstruct state during undo/redo. Lineups are persisted via `getSupplementaryState()`.

### Making Substitutions

```js
const result = engine.substitute({
  sideNumber: 1,
  outParticipantId: 'player-B',
  inParticipantId: 'player-E',
  timestamp: new Date().toISOString(), // optional
});
// { success: true }, or { success: false, error: 'IN_ALREADY_ON_COURT' }
```

When a substitution is applied:

1. The outgoing player is found in the side's lineup by `participantId`
2. Their `participantId` is replaced with the incoming player's ID
3. A `SubstitutionEvent` is recorded in `matchUp.history.substitutions[]` with a `beforePointIndex` indicating where in the point sequence it occurred
4. An entry is added to the unified `matchUp.history.entries[]` timeline

Substitutions are undoable/redoable like any other action.

A substitution that would leave the lineUp naming the wrong players is refused, with nothing recorded
and any pending redo kept: `NO_LINEUP` (the side has none), `OUT_NOT_ON_SIDE`, `IN_ALREADY_ON_COURT`
(for either side) and `SAME_PARTICIPANT`. A history recorded before these checks replays as it was.

### Substitution Rules Are Advisory

The competition format's `substitutionRules` do not refuse a substitution: a required one (a player
out of time, a penalty removal) is the host's to allow. `evaluateSubstitution()` reports the rules a
substitution made now would break, and the host decides:

```js
engine.evaluateSubstitution();
// { violations: ['MAX_PER_SEGMENT'] }
```

| Violation         | Rule                                                          |
| ----------------- | ------------------------------------------------------------- |
| `NOT_ALLOWED`     | `allowed: false`                                              |
| `MAX_PER_MATCHUP` | `maxPerMatchUp` substitutions already made                    |
| `MAX_PER_SEGMENT` | `maxPerSegment` substitutions already made in the set in play |
| `TIMING`          | `timing: 'BETWEEN_GAMES'` while a game has points in it       |
| `MATCHUP_TYPE`    | the matchUp type is not in `allowedMatchUpTypes`              |

Roster sizes and other timings are not reported: the engine holds the players on court, not the roster,
and has no state within a point.

### Querying Active Players

```js
const active = engine.getActivePlayers();
// { side1: ['player-A', 'player-E'], side2: ['player-C', 'player-D'] }
// a side with no lineup set returns []
```

### Per-Point Active Player Snapshots

When lineups are set, each `addPoint()` call automatically snapshots the active players at that moment and stores it on the `Point` record:

```ts
// After addPoint, the stored point contains:
point.activePlayers;
// Singles: ['player-A', 'player-C']
// Doubles: [['player-A', 'player-B'], ['player-C', 'player-D']]
```

This enables per-player statistics and analysis of who was on court for each point.

Since 7.7.0 the snapshot survives every rebuild of the score (`undo`, `redo`, a recalculating
`editPoint`, `removePoint`). A rebuild starts the lineups from their initial state and replays the
substitutions in order, so each point keeps the players who played it. A matchUp loaded with
`setState` and no `loadSupplementaryState` takes its initial lineups from its current ones, with its
substitutions undone.

---

## Doubles Serving Rotation

In doubles, the `serverParticipantId` field on `addPoint()` tracks which specific participant within the serving side is serving. This goes beyond `server`/`serverSideNumber` (which only identifies the side) to record the individual player.

```js
engine.addPoint({
  winningSide: 1,
  serverSideNumber: 1,
  serverParticipantId: 'player-A', // Alice serves
});

engine.addPoint({
  winningSide: 2,
  serverSideNumber: 1,
  serverParticipantId: 'player-A', // Still Alice's service game
});
```

The `serverParticipantId` is stored on the `Point` record in match history, enabling analysis of serving patterns and rotation compliance across a doubles match.

---

## Score Value Override

The `scoreValue` field on `addPoint()` overrides the default point increment (normally 1). This is useful for formats where certain points are worth more than others — for example, timed formats with power points or bonus scoring rules.

```js
// Normal point — worth 1
engine.addPoint({ winningSide: 1 });

// Power point — worth 2
engine.addPoint({ winningSide: 2, scoreValue: 2 });
```

When `scoreValue` is specified, it bypasses the normal point value resolution (including any `pointMultipliers`). The effective score increment is stored on the `Point` record as `point.scoreValue`.

:::note
`scoreValue` is distinct from `pointMultipliers`. Multipliers are condition-based rules defined in the competition format (e.g., "aces worth 2x"). `scoreValue` is a per-point override set explicitly by the caller, typically derived from external data where the score delta is already known.
:::

---

## Related Documentation

- **[Overview](./scoring-engine-overview.md)** — Introduction and architecture
- **[Core API Reference](./scoring-engine-api.md)** — Complete method reference
- **[Multi-Sport Format Support](./format-support.md)** — Format strings for different sports
- **[Visualization Applications](./visualization-applications.md)** — Building visualizations with ScoringEngine data

### Combined-point completion

For a combined-point segment such as `SET1-S:P32`, `onMatchTie` fires when the final
score is tied. `onMatchComplete` continues to require a winner. Rally increments do
not fire `onGameComplete`; a tied segment does not fire the winner-bearing `onSetComplete`.
Undo and redo retain their existing callbacks.

### A match that ends level

A timed, aggregate or exactly-N match that ends level with no declared decider (a `/TB{n}` on the
timed segment, or the `-F:` decider of an exactly-N aggregate) is `COMPLETED` without a winner, and
`onMatchTie` fires, whether a point, a set total or the end of the last timed segment closed it. No
further segment is played: a later point, game, set total or segment end is ignored and records
nothing. `getScore().decisionRequired` (and `situation.decisionRequired`) is `true`, so a host running
an elimination draw knows to ask for a decision; the engine records none. A stored timeline that
scored past a level close, as engines before this rule did, replays as it was scored, and
`getLegacyShapes()` reports `scoringPastLevelClose` (scoring-engine specification, § 9.7 and § 12.8).
