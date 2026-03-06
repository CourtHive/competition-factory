---
title: Olympic Draw
---

## Overview

An **Olympic** draw guarantees every participant a minimum of two matchUps. It is a smaller variant of the compass draw, consisting of up to four linked structures named after compass directions: East, West, North, and South.

In the factory, this draw type is represented by the constant `OLYMPIC`.

## Structure

| Structure | Abbreviation | Receives losers from           |
| --------- | ------------ | ------------------------------ |
| East      | E            | Main draw (starting structure) |
| West      | W            | East Round 1 losers            |
| North     | N            | East Round 2 losers            |
| South     | S            | West Round 1 losers            |

```text
East (Main)
  R1 losers --> West
  R2 losers --> North

West
  R1 losers --> South
```

The factory defines the structure attributes in the `OLYMPIC_ATTRIBUTES` constant:

```js
OLYMPIC_ATTRIBUTES = {
  0: { name: 'East', abbreviation: 'E' },
  '0-1': { name: 'West', abbreviation: 'W' },
  '0-2': { name: 'North', abbreviation: 'N' },
  '0-1-1': { name: 'South', abbreviation: 'S' },
};
```

## Use Cases

- Tournaments that want to guarantee at least two matchUps per participant without the overhead of a full compass draw.
- Events with limited court availability where a compass draw would be too large.
- Recreational and social tournaments.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'OLYMPIC',
});
```

## Related

- [Compass Draw](./compass) -- A larger variant guaranteeing 3 matchUps
- [Draw Links](../draw-links) -- How losers flow between structures
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
