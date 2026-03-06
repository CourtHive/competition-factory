---
title: Double Elimination
---

## Overview

A **Double Elimination** draw gives every participant a second chance. It consists of two linked structures: a main draw and a consolation (losers) bracket. Participants who lose in the main draw feed into the consolation bracket. The consolation bracket winner then plays the main draw winner to determine the overall champion.

In the factory, this draw type is represented by the constant `DOUBLE_ELIMINATION`.

## Structure

- **Main structure**: A standard single elimination bracket.
- **Consolation structure**: Receives all losers from the main bracket. Losers from each main draw round feed into corresponding consolation rounds.
- **Championship matchUp**: The consolation winner faces the main draw winner.

```text
Main Draw (MAIN stage)
  Round 1 losers --> Consolation Round 1
  Round 2 losers --> Consolation Round 3
  ...

Consolation bracket plays out, then:
  Consolation Winner vs Main Draw Winner --> Champion
```

A participant must lose twice to be eliminated -- once in the main draw and once in the consolation bracket.

## Use Cases

- Tournaments that want to guarantee every participant at least two matchUps.
- Competitive formats where a single bad result should not end a participant's tournament.
- Esports and gaming tournaments where double elimination is a standard format.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'DOUBLE_ELIMINATION',
});
```

## Related

- [Consolation Draws](./consolation-draws) -- Other consolation draw formats
- [Draw Links](../draw-links) -- How the main and consolation structures are connected
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
