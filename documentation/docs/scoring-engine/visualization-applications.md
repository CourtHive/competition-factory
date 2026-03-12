---
title: Visualization Applications
---

The ScoringEngine serves as the data backbone for match visualization applications. Its structured state, episode system, and statistics API provide the data needed to build rich, interactive match visualizations.

## Episode System

The `getEpisodes()` method transforms match state into a per-point timeline enriched with game/set/match context. Each episode represents a single point with its surrounding scoring context.

```js
const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

// ... score points ...

const episodes = engine.getEpisodes();
// Returns an array of Episode objects, one per point:
// {
//   point,         // Original point data (winner, server, result, etc.)
//   gameScore,     // Game score at this point
//   setScore,      // Set score at this point
//   matchScore,    // Match score at this point
//   gameNumber,    // Current game number within the set
//   setNumber,     // Current set number
//   isBreakPoint,  // Whether this point was a break point
//   isGamePoint,   // Whether this point was a game point
//   isSetPoint,    // Whether this point was a set point
//   isMatchPoint,  // Whether this point was a match point
//   ...
// }
```

Episodes are the primary data source for building point-by-point visualizations. They provide the narrative arc of a match in a format ready for charting libraries.

## Types of Visualizations

The ScoringEngine enables several categories of match visualization:

### Point Progression

Visualize the flow of a match as a tree or Sankey diagram showing probability at each branching point. Each node represents a score state, and branches show outcomes.

```js
const episodes = engine.getEpisodes();

// Build a tree structure from episodes
const tree = episodes.reduce((nodes, episode) => {
  // Map each point to a node with game/set context
  return buildProgressionNode(nodes, episode);
}, []);
```

### Momentum Tracking

Plot point-by-point score differential to show momentum swings.

```js
const episodes = engine.getEpisodes();
let cumulativeDiff = 0;

const momentumData = episodes.map((ep, i) => {
  cumulativeDiff += ep.point.winner === 0 ? 1 : -1;
  return { pointIndex: i, momentum: cumulativeDiff };
});
```

### Grid-Based Point Layouts

Arrange points in a grid layout where cell size represents rally length and color represents the winner.

```js
const episodes = engine.getEpisodes();

const grid = episodes.map((ep) => ({
  size: ep.point.rallyLength || 1,
  color: ep.point.winner === 0 ? 'blue' : 'red',
  game: ep.gameNumber,
  set: ep.setNumber,
}));
```

### Statistics Dashboards

Combine `getStatistics()` with `getEpisodes()` to build multi-panel dashboards.

```js
const stats = engine.getStatistics();
const set1Stats = engine.getStatistics({ setFilter: 1 });

// Render statistics panels
renderAceCount(stats);
renderBreakPointConversion(stats);
renderFirstServePercentage(stats);
```

### Real-Time Score Display

Use event handlers to update visualizations in real-time as points are scored.

```js
const engine = new ScoringEngine({
  matchUpFormat: 'SET3-S:6/TB7',
  eventHandlers: {
    onPoint: ({ score }) => {
      updateScoreDisplay(score);
      updateMomentumChart(engine.getEpisodes());
    },
    onGameComplete: () => {
      updateStatisticsPanel(engine.getStatistics());
    },
    onSetComplete: () => {
      refreshAllCharts(engine);
    },
    onMatchComplete: ({ state }) => {
      showFinalReport(state, engine.getStatistics());
    },
  },
});
```

## Live Scoring Applications

The ScoringEngine's combination of state management, undo/redo, and event handlers makes it suitable for mobile match tracker applications.

A typical live scoring app architecture:

```text
┌─────────────────────────────┐
│   Input UI (point buttons)  │
├─────────────────────────────┤
│       ScoringEngine         │
│  - addPoint / undo / redo   │
│  - event handlers           │
├─────────────────────────────┤
│   Visualization Layer       │
│  - Scoreboard               │
│  - Momentum chart           │
│  - Statistics panel         │
├─────────────────────────────┤
│   Persistence               │
│  - getState / setState      │
│  - getSupplementaryState    │
└─────────────────────────────┘
```

The engine's persistence methods (`getState`, `setState`, `getSupplementaryState`, `loadSupplementaryState`) enable saving and restoring match state across app restarts, making it suitable for mobile applications where the app may be backgrounded.

## Related Documentation

- **[Overview](./scoring-engine-overview)** — Introduction and architecture
- **[Core API Reference](./scoring-engine-api)** — Complete method reference with `getEpisodes()` and `getStatistics()`
- **[Event Handlers & Integration](./event-handlers)** — Real-time event callbacks
- **[Multi-Sport Format Support](./format-support)** — Format strings for different sports
