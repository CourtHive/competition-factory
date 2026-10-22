---
title: Scoring Engine Overview
---

The **ScoringEngine** is a stateful engine for point-by-point match scoring: a pure reducer over a typed timeline behind a stateful facade, with built-in undo/redo, event handlers, and multi-sport format support. Its rules are specified in the [scoring engine spec](./scoring-engine-spec.md).

## When to Use ScoringEngine vs scoreGovernor

| Use Case                                    | Recommended       |
| ------------------------------------------- | ----------------- |
| Track a live match point-by-point           | **ScoringEngine** |
| Undo/redo scoring actions                   | **ScoringEngine** |
| React to game/set/match completion events   | **ScoringEngine** |
| Manage substitutions and lineups            | **ScoringEngine** |
| One-off score parsing or formatting         | **scoreGovernor** |
| Bulk score operations in tournament context | **scoreGovernor** |

## Key Capabilities

- **Multi-level scoring** — Points, games, sets, and segments can all be added through a unified timeline
- **Undo/redo** — Full undo/redo stack across all input modes (points, games, sets, segments)
- **Event handlers** — Callbacks for point, game completion, set completion, match completion, match tie, undo, redo, and reset
- **Multi-sport format support** — [matchUpFormat codes](/docs/codes/matchup-format) covering many sports
- **[CODES](/docs/data-standards#codes)-compliant state** — Internal state is a standard CODES `MatchUp` object
- **Mixed-mode input** — Combine point-level, game-level, and set-level input in the same match
- **competitionFormat integration** — support for penalty types, timer profiles, substitution rules, and more
- **Persistence** — Save and restore complete engine state including redo stack and lineup snapshots

## Basic Usage

```js
import { scoreGovernor } from 'tods-competition-factory';
const { ScoringEngine } = scoreGovernor;

// Create engine with standard tennis format
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

// Add points — two conventions are supported:
// 0-based: winner: 0 (side 1) or 1 (side 2)
// 1-based: winningSide: 1 (side 1) or 2 (side 2)
engine.addPoint({ winner: 0 }); // 0-based: side 1 wins
engine.addPoint({ winningSide: 1 }); // 1-based: same thing
engine.addPoint({ winner: 0 });
engine.addPoint({ winner: 0 }); // Side 1 wins first game

// Query score
const scoreboard = engine.getScoreboard(); // '1-0'
const pointCount = engine.getPointCount(); // 4

// Undo last point
engine.undo();
engine.getScoreboard(); // '0-0 (40-0)'

// Redo the undone point
engine.redo();
engine.getScoreboard(); // '1-0'

// Check match completion
engine.isComplete(); // false
engine.getWinner(); // undefined
```

## Architecture

The score is a pure function of the configuration and the timeline: `state = reduce(config, timeline)`.

```text
┌──────────────────────────┐
│      ScoringEngine       │  Stateful facade: the timeline, the redo stack,
│  (undo/redo, events,     │  lineUps, events and the record's identity
│   format introspection)  │
├──────────────────────────┤
│   reducer (step/reduce)  │  One rule module per segment kind, service,
│                          │  completion and the views
├──────────────────────────┤
│   CODES MatchUp record   │  Written from the reduced state
└──────────────────────────┘
```

Every action is offered to the reducer, which refuses, ignores or records it; recorded actions go on the timeline in `history.entries`. Undo, redo and the corrections are timeline operations followed by a replay, so a saved record always replays to the same score. The direct functions on `scoreGovernor` (`addPoint`, `getScore`, …) are a separate, older surface: the engine does not score through them.

## Constructor Options

```ts
interface ScoringEngineOptions {
  matchUpFormat?: string; // Format code (default: 'SET3-S:6/TB7')
  matchUpId?: string; // Optional matchUp identifier
  isDoubles?: boolean; // Doubles match (default: false)
  competitionFormat?: competitionFormat; // Full competition format profile
  pointMultipliers?: PointMultiplier[]; // Point value multipliers
  eventHandlers?: ScoringEventHandlers; // Event callbacks
}
```

:::tip
If you provide a `competitionFormat`, the engine extracts `matchUpFormat`, `pointMultipliers`, and other rules automatically. You only need to pass `matchUpFormat` separately if you want to override the format from the competition profile.
:::

## Related Documentation

- **[Core API Reference](./scoring-engine-api.md)** — Complete method reference
- **[Event Handlers & Integration](./event-handlers.md)** — Event system and competitionFormat profiles
- **[Multi-Sport Format Support](./format-support.md)** — Format string grammar and sport-specific examples
- **[Visualization Applications](./visualization-applications.md)** — Building visualizations with ScoringEngine data
- **[matchUpFormat Codes](/docs/codes/matchup-format)** — Format string reference
- **[Score Governor](/docs/governors/score-governor)** — Direct scoring functions

Direct governor calls have their own ownership contracts: `scoreGovernor.addPoint` mutates the supplied matchUp. Use the engine facade when you need managed state and undo/redo.
