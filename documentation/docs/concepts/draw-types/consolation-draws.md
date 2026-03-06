---
title: Consolation Draws
---

## Overview

Consolation draws provide eliminated participants with additional competition opportunities. The factory supports a range of consolation draw formats, each differing in which main draw losers are fed into the consolation bracket and at which rounds.

All consolation draw types consist of at least two linked structures: a main draw and one or more consolation structures connected by loser links.

## Draw Types

### FIRST_ROUND_LOSER_CONSOLATION

Only participants who lose in the first round of the main draw enter the consolation bracket.

```text
Main Draw:
  Round 1 losers --> Consolation (single elimination bracket)
  Round 2+       --> eliminated
```

This is the simplest consolation format. The consolation bracket is a standard single elimination structure containing only first-round losers.

### FIRST_MATCH_LOSER_CONSOLATION

Participants enter the consolation bracket after their first loss, regardless of which main draw round they lose in. Losers from each successive main draw round feed into the corresponding consolation round.

```text
Main Draw:
  Round 1 losers --> Consolation Round 1
  Round 2 losers --> Consolation Round 2
  Round 3 losers --> Consolation Round 3
  ...
```

This is often called a "feed-in consolation" because main draw losers are fed into the consolation at each round.

### MODIFIED_FEED_IN_CHAMPIONSHIP (MFIC)

First and second round losers from the main draw are fed into the consolation structure. Losers from rounds beyond the second are eliminated.

```text
Main Draw:
  Round 1 losers --> Consolation Round 1
  Round 2 losers --> Consolation Round 2
  Round 3+       --> eliminated
```

### FEED_IN_CHAMPIONSHIP

All losers from every round of the main draw feed into the consolation structure. This gives every main draw participant a second chance regardless of when they lose.

```text
Main Draw:
  Round 1 losers --> Consolation Round 1
  Round 2 losers --> Consolation Round 3
  Round 3 losers --> Consolation Round 5
  ...
```

Consolation rounds alternate between "play-in" rounds (where fed-in losers face consolation survivors) and standard elimination rounds.

### FEED_IN_CHAMPIONSHIP_TO_SF (FICSF)

Main draw losers feed into the consolation structure through the Semifinals. Losers from rounds after the semifinals are eliminated outright.

### FEED_IN_CHAMPIONSHIP_TO_QF (FICQF)

Main draw losers feed into the consolation structure through the Quarterfinals.

### FEED_IN_CHAMPIONSHIP_TO_R16 (FICR16)

Main draw losers feed into the consolation structure through the Round of 16.

### CURTIS_CONSOLATION (CURTIS)

A Curtis consolation draw includes two consolation structures. Each consolation structure is fed by two rounds from the main draw, plus a 3-4 playoff:

```text
Main Draw:
  Round 1 losers --> Consolation A, Round 1
  Round 2 losers --> Consolation A, Round 2
  Round 3 losers --> Consolation B, Round 1
  Round 4 losers --> Consolation B, Round 2
  + 3-4 Playoff
```

## Constants and Aliases

The factory provides shorthand aliases for commonly used consolation types:

| Constant                        | Alias    | Value                             |
| ------------------------------- | -------- | --------------------------------- |
| `CURTIS_CONSOLATION`            | `CURTIS` | `'CURTIS_CONSOLATION'`            |
| `MODIFIED_FEED_IN_CHAMPIONSHIP` | `MFIC`   | `'MODIFIED_FEED_IN_CHAMPIONSHIP'` |
| `FEED_IN_CHAMPIONSHIP_TO_SF`    | `FICSF`  | `'FEED_IN_CHAMPIONSHIP_TO_SF'`    |
| `FEED_IN_CHAMPIONSHIP_TO_QF`    | `FICQF`  | `'FEED_IN_CHAMPIONSHIP_TO_QF'`    |
| `FEED_IN_CHAMPIONSHIP_TO_R16`   | `FICR16` | `'FEED_IN_CHAMPIONSHIP_TO_R16'`   |

## Generation

```js
import { FIRST_MATCH_LOSER_CONSOLATION } from 'tods-competition-factory';

const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 32,
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
});
```

All consolation draw types are generated through `engine.generateDrawDefinition()` using the appropriate `drawType` constant.

## Related

- [Feed-In Draw](./feed-in) -- The standalone feed-in structure
- [Double Elimination](./double-elimination) -- Main + consolation where consolation winner plays main winner
- [Draw Links](../draw-links) -- How loser links connect main and consolation structures
- [Consolation Policy](/docs/policies/consolationPolicy) -- Policy for controlling consolation behavior
- [Draw Types Overview](../draw-types) -- List of all pre-defined draw types
