---
title: Multi-Sport Format Support
---

The ScoringEngine supports a wide range of scoring formats across multiple sports through the [matchUpFormat code](/docs/codes/matchup-format) grammar. This page covers common format patterns and sport-specific examples.

## Format String Grammar

A matchUpFormat code describes the complete scoring structure of a match. The grammar follows a hierarchical pattern:

```text
SET<count>[XA] - S:<setFormat>[/<tiebreakFormat>] [-F:<finalSetFormat>]
```

See the [matchUpFormat Codes](/docs/codes/matchup-format) page for the full grammar specification.

## Standard Tennis Formats

### Best of 3 Sets with Tiebreak at 6-6

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
// 3 sets, games to 6, tiebreak at 6-6 to 7 points
```

### Best of 5 Sets with Match Tiebreak in Final Set

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7-F:TB10' });
// 5 sets, tiebreak at 6-6, final set is a match tiebreak to 10
```

### Best of 3 Sets, No-AD Scoring

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6NOAD/TB7' });
// No-advantage scoring: deciding point at deuce (receiver chooses side)
engine.isNoAd(); // true
```

### Best of 3 Sets, No Final Set Tiebreak (Advantage Set)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:6' });
// Regular tiebreak in sets 1-2, advantage set (no tiebreak) in set 3
engine.hasFinalSetTiebreak(); // false
```

## Tiebreak-Only Formats

For sports like pickleball, badminton, squash, and table tennis where each "set" is a single tiebreak-style game played to a target number of points.

### Pickleball (Best of 3, Games to 11)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
// 3 games to 11 points, win by 2
engine.getTiebreakAt(); // null (entire set is a tiebreak)
```

### Badminton (Best of 3, Games to 21)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB21' });
```

### Squash (Best of 5, Games to 11)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });
engine.getSetsToWin(); // 3
```

### Table Tennis (Best of 7, Games to 11)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7-S:TB11' });
engine.getSetsToWin(); // 4
```

### No-AD Tiebreak (Deciding Point)

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11NOAD' });
// At 10-10, next point wins (no requirement to win by 2)
```

## Timed Formats

For sports with timed segments (periods, halves, quarters).

### Timed Periods with Points

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
// 7 timed segments of 10 minutes each, points scored during segments
// XA = exactly all 7 segments played, A = aggregate scoring
```

After a timed segment ends:

```js
// Points are added during play
engine.addPoint({ winner: 0 });
engine.addPoint({ winner: 1 });
engine.addPoint({ winner: 0 });

// When segment timer expires
engine.endSegment();
// Segment score is finalized, next segment begins
```

### Points-based and games-based segments

A points-based segment (`T{minutes}P`) counts points: each point adds one (or its `scoreValue`) to the
segment score. What a point does in a games-based segment (`T{minutes}`, `T{minutes}G`) depends on the
format:

- **Under the SET root, not aggregate** (`SET3-S:T10`, `SET3-S:T10-G:TN3D`): a tennis-family timed set.
  Points build games of the match's game format: traditional, with deuce, No-Ad (`NOAD`) and deuce caps
  (`-G:TN{n}D`), or consecutive points (`SET3-S:T10-G:3C`), and the segment score counts games. Service alternates game by game.
- **Under another root** (`HAL2A-S:T45`, `QTR4A-S:T12`, `RND12A-S:T3`), **standalone** (`T90`), or in an
  **aggregate** format (`SET2XA-S:T10`): a point is one of the sport's own scoring units (a goal, a
  basket, an INTENNSE bolt's point), so each point adds one (or its `scoreValue`).

### A tiebreak at time

A timed segment that declares a tiebreak (`T20/TB7`, `T10P/TB1`) plays it when the segment is level at
time. `endSegment` on a level segment opens the tiebreak instead of closing the segment; points then go
to the tiebreak, and its winner takes the segment by one game (or point), recorded like a tennis
tiebreak: `SET3-S:T20/TB7` level 1-1 and won 7-0 in the tiebreak is `2-1 (7-0)`. A tiebreak to one
(`TB1`) is sudden death.

### The final segment of an exactly format

In a non-aggregate exactly format, `-F:` governs set N: `SET4X-S:T20P-F:T20` plays its fourth segment
in games, whatever the count before it.

## Consecutive Game Formats

The `-G:NC` game modifier makes a game a run of N consecutive points: the first side to win N points
in a row wins the game. It is used by formats like TYPTI.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:5-G:3C' });
// A game goes to the first side to win 3 points in a row; first to 5 games wins the set
```

## Aggregate Scoring

The `-A` modifier switches from "first to win N sets" to "play all sets, aggregate total."

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:TB11' });
// Play all 7 sets, winner determined by aggregate point total across all sets
```

Sets won are not consulted. Every set must be recorded. A tied total names no winner: with a declared
decider (`-F:` on an exactly-N aggregate) the decider breaks it; without one, the
[specification](./scoring-engine-spec.md) (§ 9.7, decided 2026-10-18) completes the match without a
winner, where v1 still plays on.

### Exactly N Sets

The `X` modifier means exactly N sets are played (no early termination).

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
// Exactly 7 segments, all played regardless of score
```

A non-aggregate exactly format is decided on sets won, but only once all N sets are recorded:

- Reaching `setsToWin` before the last set is a lead, not a win. Five sets to side 1 in
  `SET9X-S:T10` names no winner while four remain to play (since 7.6.0).
- Once every set is played, the side with more sets wins, however many it took: a 3-0 sweep of
  `SET3X-S:T10` is a win. A level count (2-2 in `SET4X-S:T10`) names no winner, so a score that names
  one is refused (since 7.5.0).
- No set beyond N is recorded; a score with an extra set is refused (since 7.5.0).

An aggregate exactly format (`XA`) may record one set more than N: a level total goes to a
sudden-death decider (`-F:`), which is set N + 1 and not one of the N sets (since 7.5.0).

## Input Levels

A parser-valid format is not a promise of a point model. `getInputLevels()` reports what the set in
play can be scored with, and `addPoint` and `addGame` refuse what it reports as unavailable:

| Segment                           | `point` | `game` | `set` |
| --------------------------------- | ------- | ------ | ----- |
| Standard, tiebreak-only, timed    | yes     | yes    | yes   |
| Combined point total (`S:P32`)    | yes     | no     | yes   |
| Outs (`S:O3`, e.g. `INN4XA-S:O3`) | no      | no     | yes   |

A segment of outs has no point or game model here, so it is scored with set totals (`addSet`): its
points are refused rather than scored as tennis sets. A final set of outs (`-F:O3`) refuses points
only once it is the set in play.

A tiebreak-only set to 11 (`SET3-S:TB11`) is how pickleball, squash and table tennis all write a
game, so the code cannot say whether only the serving side scores. The engine scores every point it
is given; a host recording side-out pickleball adds only the points the serving side won.

A match constraint such as `-M:T50` (a 50-minute match) is parsed and kept, and the clock is the
host's to enforce, as it is for timed segments.

## Format Introspection

The ScoringEngine provides methods to query format properties without parsing format strings manually:

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6NOAD/TB7-F:TB10' });

engine.isNoAd(); // true — No-AD scoring
engine.getSetsToWin(); // 2 — best of 3
engine.getTiebreakAt(); // 6 — tiebreak at 6-6
engine.hasFinalSetTiebreak(); // true — final set is a match tiebreak
engine.getFormatStructure(); // Full parsed structure for advanced use
```

## Mixed-Mode Input

The ScoringEngine supports mixing input levels within the same match. This is useful when a tracker joins mid-match and needs to enter set scores for completed sets, then switch to point-by-point tracking.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

// Enter completed sets
engine.addSet({ side1Score: 6, side2Score: 4 });
engine.addSet({ side1Score: 3, side2Score: 6 });

// Switch to point-by-point for the deciding set
engine.addPoint({ winner: 0 });
engine.addPoint({ winner: 1 });

engine.getInputMode(); // 'mixed'
```

The undo/redo system handles mixed-mode seamlessly — undoing through set boundaries works correctly regardless of how the score was entered.

## Related Documentation

- **[matchUpFormat Codes](/docs/codes/matchup-format)** — Complete format string grammar
- **[Overview](./scoring-engine-overview.md)** — Introduction and architecture
- **[Core API Reference](./scoring-engine-api.md)** — Complete method reference
- **[Event Handlers & Integration](./event-handlers.md)** — Event system and competitionFormat profiles

## Rotating-Partner Rally Totals

Americano and Mexicano matches use one segment whose two scores add up to a fixed rally total:

| Code            | Completion rule                                                      |
| --------------- | -------------------------------------------------------------------- |
| `SET1-S:P32`    | Finish after 32 rallies; 16–16 is a completed tie.                   |
| `SET1-S:P32DP`  | Finish after 32 rallies, or one deciding rally if tied.              |
| `SET1-S:P32WB2` | Finish after 32 rallies; if tied, continue until a two-point margin. |

These are combined totals, unlike a tiebreak's first-to target. Each rally increments
`side1Score` or `side2Score`. Live `getScore()` displays numeric points and no tennis games;
undo/redo replays the same completion rules. Supply server information explicitly. Multipliers
and score increments other than one are unsupported for this segment.

`generateRotatingPartnerRound` assigns the format from the saved round scoring contract.
Manual `setMatchUpStatus` refuses a conflicting format or illegal score even when generic
score validation is disabled. A tied result uses `COMPLETED` without `winningSide`.
Live completion fires `onMatchTie` for a tie and `onMatchComplete` for a winner.
Individual standings and separate deciding-phase records are subsequent work.

## Later 7.x adoption

See the [dated post-7.15 adoption notes](../whats-new-7.0.0.md#after-715-unreleased-adoption-notes) for input levels, validation errors, replay/configuration, service metadata, substitution results and refreshed tallies. These dev changes remain labeled unreleased until a tag contains them.
