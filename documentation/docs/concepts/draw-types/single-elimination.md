---
title: Single Elimination
---

## Overview

A **Single Elimination** (also known as a knockout) draw is the simplest and most common tournament draw structure. Each participant plays until they lose; a single loss eliminates them from the competition. The draw progresses through rounds, halving the number of participants at each stage until a winner is determined.

In the factory, this draw type is represented by the constant `SINGLE_ELIMINATION`. The aliases `KNOCKOUT` and `ELIMINATION` both resolve to the same value.

## Structure

- Draw sizes must be powers of 2 (e.g., 4, 8, 16, 32, 64, 128).
- Each round contains exactly half the matchUps of the previous round.
- The draw consists of a single structure in the `MAIN` stage.
- Byes are used when the number of participants is less than the draw size.

```text
Draw Size: 8

Round 1 (4 matchUps)  -->  Round 2 (2 matchUps)  -->  Final (1 matchUp)
```

## Use Cases

- Standard tournament main draws at all levels.
- Qualifying structures where a fixed number of qualifiers advance.
- Any scenario requiring a straightforward bracket format.

## Generation

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 16,
  drawType: 'SINGLE_ELIMINATION',
});
```

When fewer participants than the draw size are available, byes are automatically placed according to seeding and positioning policies.

## Seeding

Seeds are positioned according to the active seeding policy. The default behavior separates top seeds (e.g., seed 1 at the top, seed 2 at the bottom) and clusters remaining seeds.

## Related

- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
- [Draw Links](../draw-links) -- How structures connect to form complex draws
- [Generation Governor](/docs/governors/generation-governor) -- API reference for `generateDrawDefinition`
