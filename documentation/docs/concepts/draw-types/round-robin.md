---
title: Round Robin
---

## Overview

A **Round Robin** draw divides participants into groups where every participant plays every other participant within their group. Results are determined by tallying wins, losses, and other tie-breaking criteria rather than by single-match elimination.

In the factory, this draw type is represented by the constant `ROUND_ROBIN`. There is also a `DOUBLE_ROUND_ROBIN` variant where each participant plays every other participant twice.

## Structure

- The draw uses a `CONTAINER` structure type that holds multiple `ITEM` structures (groups).
- Each group is an independent round robin where every participant plays every other participant once.
- Group sizes are configurable (commonly 3 or 4 participants per group).
- Results within each group are determined by a tally policy.

```text
Group A (4 participants):
  Round 1: P1 vs P2, P3 vs P4
  Round 2: P1 vs P3, P2 vs P4
  Round 3: P1 vs P4, P2 vs P3

Group B (4 participants):
  Round 1: P5 vs P6, P7 vs P8
  ...
```

## Tally and Finishing Positions

Finishing positions within each group are determined by the `roundRobinTallyPolicy`. The default tally considers:

1. Match wins/losses ratio
2. Head-to-head results (when two participants are tied)
3. Sets won/lost ratio
4. Games won/lost ratio
5. Points won/lost ratio (if applicable)

The tally policy is configurable. See the [Round Robin Tally Policy](/docs/policies/roundRobinTallyPolicy) documentation.

## Use Cases

- Group stages of larger tournaments that feed into playoff brackets.
- Leagues and dual-format events.
- Small tournaments where every participant should play multiple matchUps.
- Qualifying rounds where group winners advance.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'ROUND_ROBIN',
  structureOptions: {
    groupSize: 4, // 4 participants per group (default)
  },
});
```

## Related

- [Round Robin with Playoff](./round-robin-with-playoff) -- Round robin groups followed by knockout playoffs
- [Round Robin Tally Policy](/docs/policies/roundRobinTallyPolicy) -- Configuring tally and tie-breaking rules
- [Finishing Positions](../finishing-positions) -- How finishing positions are determined
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
