---
title: Compass Draw
---

## Overview

A **Compass** draw guarantees every participant a minimum of three matchUps. It consists of up to eight linked structures, named after compass directions: East, West, North, South, Northeast, Northwest, Southeast, and Southwest.

In the factory, this draw type is represented by the constant `COMPASS`.

## Structure

The draw operates as a cascading series of consolation structures:

| Structure | Abbreviation | Receives losers from           |
| --------- | ------------ | ------------------------------ |
| East      | E            | Main draw (starting structure) |
| West      | W            | East Round 1 losers            |
| North     | N            | East Round 2 losers            |
| South     | S            | West Round 1 losers            |
| Northeast | NE           | East Round 3 losers            |
| Northwest | NW           | North Round 1 losers           |
| Southwest | SW           | South Round 1 losers           |
| Southeast | SE           | West Round 2 losers            |

```text
East (Main)
  R1 losers --> West
  R2 losers --> North
  R3 losers --> Northeast

West
  R1 losers --> South
  R2 losers --> Southeast

North
  R1 losers --> Northwest

South
  R1 losers --> Southwest
```

The number of structures generated depends on the draw size. Smaller draws may produce fewer than eight structures because some directions would have too few participants to form a meaningful bracket.

## Compass Attributes

The factory defines compass structure attributes in the `COMPASS_ATTRIBUTES` constant, which maps link paths to structure names and abbreviations:

```js
COMPASS_ATTRIBUTES = {
  0: { name: 'East', abbreviation: 'E' },
  '0-1': { name: 'West', abbreviation: 'W' },
  '0-2': { name: 'North', abbreviation: 'N' },
  '0-3': { name: 'Northeast', abbreviation: 'NE' },
  '0-1-1': { name: 'South', abbreviation: 'S' },
  '0-1-2': { name: 'Southwest', abbreviation: 'SW' },
  '0-2-1': { name: 'Northwest', abbreviation: 'NW' },
  '0-1-1-1': { name: 'Southeast', abbreviation: 'SE' },
};
```

## Use Cases

- Junior and development tournaments where guaranteeing playing time is important.
- Social and club tournaments where participants expect multiple matches regardless of results.
- Any format where a minimum of three matchUps per participant is desired.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'COMPASS',
});
```

## Related

- [Olympic Draw](./olympic) -- A smaller variant guaranteeing 2 matchUps
- [Draw Links](../draw-links) -- How losers flow between compass structures
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
