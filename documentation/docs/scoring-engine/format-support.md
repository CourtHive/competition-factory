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

## Consecutive Game Formats

The `-G:NC` modifier indicates N consecutive games within a set, used by formats like TYPTI.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-G:3C' });
// Standard tennis with 3 consecutive games per rotation
```

## Aggregate Scoring

The `-A` modifier switches from "first to win N sets" to "play all sets, aggregate total."

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:TB11' });
// Play all 7 sets, winner determined by aggregate point total across all sets
```

### Exactly N Sets

The `X` modifier means exactly N sets are played (no early termination).

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
// Exactly 7 segments, all played regardless of score
```

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
