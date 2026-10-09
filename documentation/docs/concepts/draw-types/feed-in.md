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

## As a qualifying structure

Since 7.9.0 a `FEED_IN` structure can be a **qualifying** structure of any `drawSize` — a staggered-entry
qualifying draw, where later-arriving entrants are fed into later rounds. It produces `qualifyingPositions`
qualifiers only when that count divides `drawSize` at least twice over, so its final round is never before its
last fed round: 12 positions give 1, 2, 3, 4 or 6 qualifiers; 13 give only 1; 10 give 1, 2 or 5. Any other
count is refused with `INVALID_VALUES`. Qualifying seeds take the fed positions first — the lowest seed numbers
in the latest fed round — and the remaining seeds are spread across round 1.
[`getFeedInQualifyingPositions`](/docs/governors/draws-governor#getfeedinqualifyingpositions) returns the
valid counts for a `drawSize`, and `drawType: 'FEED_IN'` is accepted in `qualifyingProfiles[].structureProfiles`
for [`generateDrawDefinition`](/docs/governors/generation/generateDrawDefinition) and by
[`addQualifyingStructure`](/docs/governors/draws-governor#addqualifyingstructure).

## Related

- [Consolation Draws](./consolation-draws.mdx) -- Draw types that use feed-in consolation structures
- [Feed-In Policy](/docs/policies/feedInPolicy) -- Policy for controlling feed-in behavior
- [Draw Types Overview](../draw-types.md) -- List of all pre-defined draw types
