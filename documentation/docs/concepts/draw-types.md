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

- **AD_HOC** - An arbitrary number of matchUps may be added to an arbitrary number of rounds.
- **COMPASS** - Includes up to 8 structures; ensures participants a minimum of 3 matchUps.
- **CURTIS** - Includes 2 consolation structures, each fed by 2 main structure rounds, and a 3-4 playoff.
- **DOUBLE_ELIMINATION** - Main structure losers feed into consolation; consolation winner plays main structure winner.
- **FEED_IN_CHAMPIONSHIP_TO_QF** - Main structure losers feed into consolation through the Quarterfinals.
- **FEED_IN_CHAMPIONSHIP_TO_R16** - Main structure losers feed into consolation through the Round of 16.
- **FEED_IN_CHAMPIONSHIP_TO_SF** - Main structure losers feed into consolation through the Semifinals.
- **FEED_IN_CHAMPIONSHIP** - Main structure losers in every round feed into consolation.
- **FEED_IN** - Also known as "staggered entry", participants feed into the main structure at specified rounds.
- **FIRST_MATCH_LOSER_CONSOLATION** - Losers feed into consolation whenever their first loss occurs.
- **FIRST_ROUND_LOSER_CONSOLATION** - Only first round losers feed into consolation structure.
- **MODIFIED_FEED_IN_CHAMPIONSHIP** - First and Second round losers are fed into consolation structure.
- **OLYMPIC** - Includes up to 4 structures; ensures participants a minimum of 2 matchUps.
- **PLAYOFF** - All positions are played off; structures are added to ensure unique finishing positions. Note: `PLAY_OFF` (with underscore) is a stage type applied to structures. `PLAYOFF` (no underscore) is a draw type that generates structures to play off all positions.
- **ROUND_ROBIN** - Participants divided into specified group sizes.
- **ROUND_ROBIN_WITH_PLAYOFF** - Includes automated generation of specified playoff structures.
- **SINGLE_ELIMINATION** - Standard knockout draw structure.

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

## How Links Work

Links define the flow of participants between structures and determine [finishing positions](./finishing-positions) for ranking point calculations. Each link specifies:

### Link Structure

```ts
type Link = {
  linkType: 'LOSER' | 'WINNER' | 'POSITION'; // Type of participant flow
  source: {
    structureId: string; // Source structure UUID
    roundNumber?: number; // Optional: specific round
    finishingPositions?: number[]; // For POSITION links
  };
  target: {
    structureId: string; // Destination structure UUID
    roundNumber?: number; // Optional: target round
    feedProfile?: string; // Feed pattern (e.g., 'DRAW')
  };
};
```

### Link Types

**LOSER Links** - Direct losing participants:

```js
{
  linkType: 'LOSER',
  source: {
    structureId: 'main-draw-id',
    roundNumber: 1  // Round 1 losers
  },
  target: {
    structureId: 'consolation-id',
    roundNumber: 1,
    feedProfile: 'DRAW'  // Positioned by draw
  }
}
```

**WINNER Links** - Direct winning participants:

```js
{
  linkType: 'WINNER',
  source: {
    structureId: 'round-robin-group-1',
    finishingPositions: [1]  // Group winners
  },
  target: {
    structureId: 'playoff-structure',
    roundNumber: 1
  }
}
```

**POSITION Links** - Feed based on finishing position:

```js
{
  linkType: 'POSITION',
  source: {
    structureId: 'qualifying-structure-a',
    finishingPositions: [1, 2, 3, 4]  // Top 4 finishers
  },
  target: {
    structureId: 'main-draw-id',
    roundNumber: 1,
    feedProfile: 'DRAW'
  }
}
```

### Feed Profiles

**DRAW** - Position assignments determined by draw/seeding  
**TOP_DOWN** - Fill positions sequentially from top  
**BOTTOM_UP** - Fill positions sequentially from bottom  
**WATERFALL** - Distribute across available positions

### Example: Compass Draw Links

A Compass draw (8 structures) uses multiple links:

```js
drawDefinition.links = [
  // Main draw losers to compass points
  {
    linkType: 'LOSER',
    source: { structureId: 'main', roundNumber: 1 },
    target: { structureId: 'east', roundNumber: 1 },
  },
  {
    linkType: 'LOSER',
    source: { structureId: 'main', roundNumber: 2 },
    target: { structureId: 'west', roundNumber: 1 },
  },

  // East losers to southeast
  {
    linkType: 'LOSER',
    source: { structureId: 'east', roundNumber: 1 },
    target: { structureId: 'southeast', roundNumber: 1 },
  },

  // West losers to southwest
  {
    linkType: 'LOSER',
    source: { structureId: 'west', roundNumber: 1 },
    target: { structureId: 'southwest', roundNumber: 1 },
  },

  // ... more links for all 8 structures
];
```

## Creating Custom Linked Structures

While pre-defined draw types cover most scenarios, you can create custom configurations:

```js
// Generate structures separately
const { structure: mainStructure } = tournamentEngine.generateStructure({
  structureName: 'Main Draw',
  stage: 'MAIN',
  drawSize: 16,
});

const { structure: consolationStructure } = tournamentEngine.generateStructure({
  structureName: 'Consolation',
  stage: 'CONSOLATION',
  drawSize: 8,
});

// Define custom links
const links = [
  {
    linkType: 'LOSER',
    source: { structureId: mainStructure.structureId, roundNumber: 1 },
    target: { structureId: consolationStructure.structureId, roundNumber: 1 },
  },
];

// Combine into draw definition
const drawDefinition = {
  drawId: UUID(),
  structures: [mainStructure, consolationStructure],
  links: links,
};
```

## Qualifying Conceptual Model

### Traditional View (Incorrect in CODES)

```text
Main Draw (separate entity)
Qualifying Draw (separate entity)
```

### CODES View (Correct)

```text
Draw:
  ├─ QUALIFYING Stage
  │   ├─ Qualifying Structure A
  │   ├─ Qualifying Structure B
  │   └─ Qualifying Structure C
  └─ MAIN Stage
      └─ Main Structure (receives qualifiers via links)
```

### Key Points

1. **Qualifying is a stage**, not a separate draw
2. **Multiple qualifying structures** can exist in the same QUALIFYING stage
3. **Different qualifying structures** can feed into different rounds of the main draw
4. **Fed participants at each round** can come from different qualifying structures
5. **Links define the flow** from qualifying structures to main draw positions

### Real-World Example: ITF Tournament

```js
// 64-player main draw with 16 qualifiers
const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  drawSize: 64,
  drawType: 'SINGLE_ELIMINATION',
  qualifyingProfiles: [
    {
      roundTarget: 1,
      structureProfiles: [
        // 64 players compete for 16 qualifying spots
        { drawSize: 64, seedsCount: 16, qualifyingPositions: 16 },
      ],
    },
  ],
});

// Results in:
// QUALIFYING Stage:
//   - One 64-player structure producing 16 qualifiers
// MAIN Stage:
//   - 64-player main draw with 16 qualifier positions in Round 1
```

### Advanced Example: Progressive Qualifying

Some tournaments use progressive qualifying where different levels feed into different rounds:

```js

**API Reference:** [generateDrawDefinition](/docs/governors/generation-governor#generatedrawdefinition)

const { drawDefinition } = tournamentEngine.generateDrawDefinition({
  drawSize: 128,
  qualifyingProfiles: [
    {
      roundTarget: 1,
      structureProfiles: [
        { drawSize: 128, qualifyingPositions: 16 }  // Main qualifying
      ]
    },
    {
      roundTarget: 2,
      structureProfiles: [
        { drawSize: 32, qualifyingPositions: 4 }    // Lucky loser qualifying
      ]
    }
  ]
});

// Creates:
// - 128-player qualifying for 16 spots in Main Round 1
// - 32-player lucky loser qualifying for 4 spots in Main Round 2
```

## Custom Playoff Topologies with `withPlayoffs` {#custom-playoff-topologies}

The `withPlayoffs` parameter on [`generateDrawDefinition`](/docs/governors/generation-governor#generatedrawdefinition) supports recursive nesting via its `roundPlayoffs` field. This enables building arbitrary COMPASS-like topologies — or any custom tree of playoff structures — in a single call, without manually chaining `addPlayoffStructures`.

### How Recursive Playoffs Work

Each level of `withPlayoffs` creates PLAY_OFF structures from the specified source rounds via LOSER links. The `roundPlayoffs` field maps a source round number to a child `WithPlayoffsArgs`, creating sub-playoffs from that child structure's losers.

```text
withPlayoffs tree:                        Resulting structures:

East (MAIN)                               East (MAIN, drawSize 32)
├── R1 losers → West                      ├── West (PLAY_OFF, 16)
│   ├── R1 losers → South                 │   ├── South (PLAY_OFF, 8)
│   │   └── R1 losers → Southeast         │   │   └── Southeast (PLAY_OFF, 4)
│   └── R2 losers → Southwest             │   └── Southwest (PLAY_OFF, 4)
├── R2 losers → North                     ├── North (PLAY_OFF, 8)
│   └── R1 losers → Northwest             │   └── Northwest (PLAY_OFF, 4)
└── R3 losers → Northeast                 └── Northeast (PLAY_OFF, 4)
```

### Full COMPASS Example

```js
const { drawDefinition } = engine.generateDrawDefinition({
  drawSize: 32,
  drawName: 'East',
  withPlayoffs: {
    roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
    playoffAttributes: {
      '0-1': { name: 'West', abbreviation: 'W' },
      '0-2': { name: 'North', abbreviation: 'N' },
      '0-3': { name: 'Northeast', abbreviation: 'NE' },
    },
    roundPlayoffs: {
      1: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }],
        playoffAttributes: {
          '0-1': { name: 'South', abbreviation: 'S' },
          '0-2': { name: 'Southwest', abbreviation: 'SW' },
        },
        roundPlayoffs: {
          1: {
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: {
              '0-1': { name: 'Southeast', abbreviation: 'SE' },
            },
          },
        },
      },
      2: {
        roundProfiles: [{ 1: 1 }],
        playoffAttributes: {
          '0-1': { name: 'Northwest', abbreviation: 'NW' },
        },
      },
    },
  },
});
```

This produces the same 8-structure, 7-link, 72-matchUp topology as the built-in `COMPASS` draw type, but with full control over structure naming, depth, and which branches exist.

### Partial Topologies

You can omit branches to create partial COMPASS draws. For example, a 6-structure variant (no Southwest or Southeast) simply omits those `roundPlayoffs` entries:

```js
withPlayoffs: {
  roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
  roundPlayoffs: {
    1: { roundProfiles: [{ 1: 1 }] },      // West → South only
    2: { roundProfiles: [{ 1: 1 }] },      // North → Northwest only
  },
}
```

### Using with mocksEngine

Recursive `withPlayoffs` works directly in `drawProfiles` for both `mocksEngine.generateTournamentRecord()` patterns:

```js
// Via top-level drawProfiles
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [
    {
      drawSize: 32,
      drawName: 'East',
      withPlayoffs: {
        /* nested roundPlayoffs tree */
      },
    },
  ],
});

// Via eventProfiles
const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  eventProfiles: [
    {
      drawProfiles: [
        {
          drawSize: 32,
          withPlayoffs: {
            /* nested roundPlayoffs tree */
          },
        },
      ],
    },
  ],
});
```

See [withPlayoffs API reference](/docs/governors/generation-governor#withplayoffs) for the full `WithPlayoffsArgs` type and more examples.

## Related Policies and Methods

:::note
**Additional Playoff Structures**

- `getAvailablePlayoffProfiles()` - Valid attributes for playoff structures generation
- `generateAndPopulatePlayoffStructures()` - Generates playoff structures
- `attachPlayoffStructures()` - Attaches playoff structures to target drawDefinition
- `addPlayoffStructures()` - Combines generation and attachment of playoff structures

**Voluntary Consolation Structure**

- `getEligibleVoluntaryConsolationParticipants()` - Configurable method for determining eligibility
- `generateVoluntaryConsolation()` - Generates matchUps for consolation structure

**Feed-In Configuration**

- [Feed-In Policy](/docs/policies/feedInPolicy) - Configure consolation feed patterns
- [Progression Policy](/docs/policies/progressionPolicy) - Control automatic qualifier placement

  :::

## Related Documentation

- **[Draw Generation](./draws-overview)** - Creating and configuring draws
- **[Actions](./actions)** - Managing draw structures and participants
- **[Feed-In Policy](/docs/policies/feedInPolicy)** - Detailed feed pattern configuration
- **[Generation Governor](/docs/governors/generation-governor)** - Complete API reference
