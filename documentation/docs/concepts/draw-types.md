---
title: Draw Types
---

## Overview

[CODES](/docs/data-standards#codes) provides a powerful framework for describing tournament draws of arbitrary complexity using **linked structures**. A draw can consist of multiple structures connected by links that define how participants flow between them based on match outcomes, finishing positions, or qualifying results.

### Key Concepts

**Structures**: Independent draw components (e.g., main draw, consolation, qualifying)  
**Links**: Define participant propagation between structures  
**Stages**: Logical groupings of structures (QUALIFYING, MAIN, CONSOLATION, PLAY_OFF)  
**Draw Types**: Pre-configured combinations of linked structures

## Understanding Linked Structures

Traditional tournament software often treats draws as monolithic entities. CODES takes a different approach: **any draw is a collection of linked structures** that can be configured in unlimited ways.

### Basic Example: Feed-In Championship

```text
Main Draw (Structure 1)
  ├─ Round 1 losers → Consolation Round 1 (Structure 2)
  ├─ Round 2 losers → Consolation Round 2 (Structure 2)
  └─ Round 3 losers → Consolation Round 3 (Structure 2)
```

### Complex Example: Multi-Stage Qualifying

```text
Qualifying Stage:
  ├─ Qualifying Structure A (16 players → 4 qualifiers)
  │   └─ Feeds into Main Draw Round 1, positions 1-4
  ├─ Qualifying Structure B (16 players → 4 qualifiers)
  │   └─ Feeds into Main Draw Round 1, positions 5-8
  └─ Qualifying Structure C (8 players → 2 qualifiers)
      └─ Feeds into Main Draw Round 2, positions 1-2

Main Stage:
  └─ Main Draw (32 positions)
      ├─ Receives qualifiers at Round 1 (8 positions)
      ├─ Receives qualifiers at Round 2 (2 positions)
      └─ Feeds losers into Consolation

Consolation Stage:
  └─ Consolation Draw
```

## Pre-Defined Draw Types

The convenience method `engine.generateDrawDefinition()` generates the following draw types:

- **[AD_HOC](./draw-types/ad-hoc)** - An arbitrary number of matchUps may be added to an arbitrary number of rounds. Supports automated pairing via [DrawMatic](./draw-types/drawmatic).
- **[COMPASS](./draw-types/compass)** - Includes up to 8 structures; ensures participants a minimum of 3 matchUps.
- **CURTIS** - Includes 2 consolation structures, each fed by 2 main structure rounds, and a 3-4 playoff.
- **[DOUBLE_ELIMINATION](./draw-types/double-elimination)** - Main structure losers feed into consolation; consolation winner plays main structure winner.
- **[FEED_IN_CHAMPIONSHIP_TO_QF](./draw-types/consolation-draws)** - Main structure losers feed into consolation through the Quarterfinals.
- **[FEED_IN_CHAMPIONSHIP_TO_R16](./draw-types/consolation-draws)** - Main structure losers feed into consolation through the Round of 16.
- **[FEED_IN_CHAMPIONSHIP_TO_SF](./draw-types/consolation-draws)** - Main structure losers feed into consolation through the Semifinals.
- **[FEED_IN_CHAMPIONSHIP](./draw-types/consolation-draws)** - Main structure losers in every round feed into consolation.
- **[FEED_IN](./draw-types/feed-in)** - Also known as "staggered entry", participants feed into the main structure at specified rounds.
- **[FIRST_MATCH_LOSER_CONSOLATION](./draw-types/consolation-draws)** - Losers feed into consolation whenever their first loss occurs.
- **[FIRST_ROUND_LOSER_CONSOLATION](./draw-types/consolation-draws)** - Only first round losers feed into consolation structure.
- **[LUCKY_DRAW](./draw-types/lucky-draw)** - Supports any participant count (not just power-of-2). Rounds with an odd number of matchUps produce a "lucky loser" who advances to balance the next round.
- **[MODIFIED_FEED_IN_CHAMPIONSHIP](./draw-types/consolation-draws)** - First and Second round losers are fed into consolation structure.
- **[OLYMPIC](./draw-types/olympic)** - Includes up to 4 structures; ensures participants a minimum of 2 matchUps.
- **[PLAYOFF](./draw-types/playoff)** - All positions are played off; structures are added to ensure unique finishing positions. Note: `PLAY_OFF` (with underscore) is a stage type applied to structures. `PLAYOFF` (no underscore) is a draw type that generates structures to play off all positions.
- **[ROUND_ROBIN](./draw-types/round-robin)** - Participants divided into specified group sizes.
- **[ROUND_ROBIN_WITH_PLAYOFF](./draw-types/round-robin-with-playoff)** - Includes automated generation of specified playoff structures.
- **[SINGLE_ELIMINATION](./draw-types/single-elimination)** - Standard knockout draw structure.

## Stages: Organizing Structures

In CODES, **qualifying is conceptualized as a STAGE of a draw**, not a separate draw. This is a fundamental difference from traditional systems.

### Stage Types

**QUALIFYING Stage:**

- Contains one or more qualifying structures
- Each structure can produce qualifiers
- Different qualifying structures can feed into different rounds of the main draw
- Qualifiers from one structure can enter at Round 1 while qualifiers from another structure enter at Round 2

**MAIN Stage:**

- The primary competition structure
- Can receive qualifiers at multiple entry points
- Can feed participants into consolation or playoff structures

**CONSOLATION Stage:**

- Receives participants who lose in the main draw
- Can receive participants from multiple rounds
- Provides additional competition opportunities

**PLAY_OFF Stage:**

- Playoff structures for determining specific finishing positions
- Common after round robin group play

### Multi-Structure Qualifying

A draw can have multiple qualifying structures in the QUALIFYING stage, each feeding into different parts of the main draw:

```js
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  drawSize: 32,
  drawType: 'SINGLE_ELIMINATION',
  qualifyingProfiles: [
    {
      roundTarget: 1, // Feed into Round 1
      structureProfiles: [
        { drawSize: 16, qualifyingPositions: 4 }, // Qualifying Structure A → 4 qualifiers
        { drawSize: 8, qualifyingPositions: 2 }, // Qualifying Structure B → 2 qualifiers
      ],
    },
    {
      roundTarget: 2, // Feed into Round 2
      structureProfiles: [
        { drawSize: 8, qualifyingPositions: 2 }, // Qualifying Structure C → 2 qualifiers
      ],
    },
  ],
});

// Result:
// - Qualifying Structure A: 16 players compete, top 4 qualify for Main Round 1
// - Qualifying Structure B: 8 players compete, top 2 qualify for Main Round 1
// - Qualifying Structure C: 8 players compete, top 2 qualify for Main Round 2
// - Main Draw: 32 positions with 6 qualifier spots in Round 1 and 2 in Round 2
```

### Mixed Entry Points

The same main draw structure can receive qualifiers at different rounds, with each round's qualifiers coming from different qualifying structures:

```text

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

Main Draw Structure (32 positions):
  Round 1 (16 positions):
    ├─ Positions 1-4: Qualifiers from Qualifying A
    ├─ Positions 5-6: Qualifiers from Qualifying B
    └─ Positions 7-16: Direct acceptances

  Round 2 (8 positions):
    ├─ 6 positions: Winners from Round 1
    └─ Positions 7-8: Qualifiers from Qualifying C (late entry)
```

## Related Documentation

- **[Draw Links](./draw-links)** - How links connect structures and define participant flow
- **[Draw Generation](./draws-overview)** - Creating and configuring draws
- **[Actions](./actions)** - Managing draw structures and participants
- **[Generation Governor](/docs/governors/generation-governor)** - Complete API reference
