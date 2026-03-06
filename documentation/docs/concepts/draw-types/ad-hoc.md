---
title: Ad Hoc (Flex Rounds)
---

## Overview

An **Ad Hoc** draw (also known as **Flex Rounds**) allows an arbitrary number of matchUps to be added to an arbitrary number of rounds. Unlike elimination or round robin draws, there is no predetermined bracket structure -- matchUps are created as needed.

In the factory, this draw type is represented by the constant `AD_HOC`. The alias `FLEX_ROUNDS` resolves to the same value.

## Structure

- No fixed draw size or bracket shape.
- Rounds can contain any number of matchUps.
- Participants can appear in multiple rounds without being eliminated.
- There are no links between rounds -- each round is independent.
- No automatic advancement between rounds.

```text
Round 1: P1 vs P2, P3 vs P4, P5 vs P6
Round 2: P1 vs P3, P2 vs P5
Round 3: P3 vs P5, P1 vs P6, P2 vs P4
```

## Use Cases

- Informal or social tournaments without a fixed bracket.
- Practice sessions or training events.
- Formats where a tournament director manually assigns matchUps each round based on availability or other criteria.
- Events where the number of rounds and matchUps per round are not known in advance.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 12,
  drawType: 'AD_HOC',
});
```

MatchUps can be added to the draw after generation using the appropriate engine methods.

## Related

- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
- [Generation Governor](/docs/governors/generation-governor) -- API reference for draw generation
