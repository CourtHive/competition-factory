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
// One episode per recorded point:
// { action: 'addPoint', point, game, set, needed, nextService, result, complete }
// point: { index, number, winner, server, score, result }
// game: { index, isTiebreak, complete, winner }
// set: { index, complete, winner }
// needed: { pointsToGame, pointsToSet, pointsToMatch, gamesToSet, isBreakpoint }
```

Episodes are the primary data source for building point-by-point visualizations. They provide the narrative arc of a match in a format ready for charting libraries.

## Types of Visualizations

The ScoringEngine enables several categories of match visualization:

### Points Needed — use `episode.needed`, do not recompute it

`getEpisodes()` already carries, per point, how many points each side needs to win the current game,
set and match. A chart plotting "points to win the set" is plotting `episode.needed.pointsToSet`.

```js
const episodes = engine.getEpisodes();
const pointsToSet = episodes.map((episode) => episode.needed.pointsToSet); // [number, number][]
```

`Episode`, `EpisodeNeeded` and `PointsToDecoration` are **published types**. Import them rather than
redeclaring the shape locally — a redeclared copy cannot be told when the factory's gains a field,
and `pointsToMatch` is the one most often missing from hand-written copies:

```ts
import type { Episode, EpisodeNeeded } from 'tods-competition-factory';
```

→ [calculatePointsTo](../governors/score-governor.md#calculatepointsto), which computes it.

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

const points = engine.getState().history?.points ?? [];
const grid = episodes.map((ep) => ({
  size: points[ep.point.index]?.rallyLength ?? 1,
  color: ep.point.winner === 0 ? 'blue' : 'red',
  game: ep.game.index,
  set: ep.set.index,
}));
```

### Statistics Dashboards

Combine `getStatistics()` with `getEpisodes()` to build multi-panel dashboards.

```js
const stats = engine.getStatistics();
const set1Stats = engine.getStatistics({ setFilter: 0 });

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

## Mixed input timelines

Episodes project recorded points; `addGame` and `addSet` do not invent point records. They still affect
where later points belong. A game entered after a partial point game supersedes that partial game;
the last tracked point is not credited with winning it.

```js
const mixed = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
mixed.addPoint({ winner: 0, rallyLength: 9 });
mixed.addGame({ winner: 1 }); // interrupts the partial game
for (let game = 0; game < 6; game++) mixed.addGame({ winner: 0 }); // completes set 1
mixed.addSet({ side1Score: 4, side2Score: 6 }); // appends completed set 2
mixed.addPoint({ winner: 1 });
const timeline = mixed.getEpisodes();
// timeline.length === 2; timeline[0].game.complete === false
// timeline[1].set.index === 2
```

Metadata such as `rallyLength` is absent from the episode point projection. Join the stored history by
`episode.point.index`, as the grid example does. `needed` describes opportunities before that point;
`game.complete` and `set.complete` describe completions on it. See the [core API](./scoring-engine-api.md#getepisodes).

`StatisticsOptions.setFilter`, episode point/game/set indices and stored point indices are zero-based. The first set is `setFilter: 0`; CODES `winningSide` remains one-based.

## Related Documentation

- **[Overview](./scoring-engine-overview.md)** — Introduction and architecture
- **[Core API Reference](./scoring-engine-api.md)** — Complete method reference with `getEpisodes()` and `getStatistics()`
- **[Event Handlers & Integration](./event-handlers.md)** — Real-time event callbacks
- **[Multi-Sport Format Support](./format-support.md)** — Format strings for different sports
