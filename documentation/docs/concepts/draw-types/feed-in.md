---
title: Feed-In Draw
---

## Overview

A **Feed-In** draw (also known as "staggered entry") is a structure where participants enter the draw at different rounds rather than all starting in Round 1. Participants "feed in" at specified rounds, playing against winners from earlier rounds.

In the factory, this draw type is represented by the constant `FEED_IN`.

## Structure

Unlike a standard elimination bracket where all participants begin in the first round, a feed-in draw staggers entry points:

```text
Round 1:  P1 vs P2  -->  Winner
                              vs  P5 (fed in at Round 2)  -->  Winner
Round 1:  P3 vs P4  -->  Winner                                    vs  P7 (fed in at Round 3)
                              vs  P6 (fed in at Round 2)  -->  Winner
```

Key characteristics:

- Each round after the first introduces new participants.
- Fed-in participants face winners from previous rounds.
- The number of participants fed into each round is configurable.

## Use Cases

- Consolation structures where losers from successive main draw rounds feed in at progressive rounds.
- Formats where late entries or qualifiers need to join an in-progress bracket.
- As a building block for more complex draw types like `FEED_IN_CHAMPIONSHIP`.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'FEED_IN',
});
```

Feed-in behavior can also be controlled via the [Feed-In Policy](/docs/policies/feedInPolicy).

## Related

- [Consolation Draws](./consolation-draws) -- Draw types that use feed-in consolation structures
- [Feed-In Policy](/docs/policies/feedInPolicy) -- Policy for controlling feed-in behavior
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
