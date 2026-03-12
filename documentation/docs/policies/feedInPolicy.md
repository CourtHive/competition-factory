# Feed-In Policy

## Overview

The **Feed-In Policy** controls how losers from a main draw structure feed into a consolation structure in feed-in draw types. This policy determines the direction (TOP_DOWN or BOTTOM_UP) and grouping order for feeding players from one structure to another, critical for maintaining competitive balance in consolation draws.

Feed-in policies are used in draw types like:

- **FEED_IN_CHAMPIONSHIP** - Full feed-in consolation (all rounds except final)
- **FIRST_MATCH_LOSER_CONSOLATION** - Players who lose their first MATCH (could be round 1 or 2 if they had a BYE)
- **FIRST_ROUND_LOSER_CONSOLATION** - Players who lose in round 1 only (regardless of BYEs)
- **MODIFIED_FEED_IN_CHAMPIONSHIP** - Modified feed-in pattern
- **FEED_IN_CHAMPIONSHIP_TO_SF/QF/R16** - Feed-in to specific round

---

## Policy Structure

```typescript
{
  feedIn: {
    feedFromMainFinal?: boolean;
    roundGroupedOrder?: number[][];
    roundFeedProfiles?: ('TOP_DOWN' | 'BOTTOM_UP')[];
  }
}
```

---

## Attributes

### `feedFromMainFinal`

**Type:** `boolean` (optional)  
**Default:** `false`  
**Purpose:** Controls whether losers from the main draw final feed into the consolation

When `true`:

- Loser of main draw final feeds into consolation structure
- Used for FIRST_MATCH_LOSER_CONSOLATION (FMLC) draws
- Creates link from final round of main to consolation

When `false` (default):

- Main draw final loser does NOT feed to consolation
- Standard feed-in championship behavior
- Only pre-final round losers feed to consolation

**Examples:**

```javascript
import { POLICY_TYPE_FEED_IN } from 'tods-competition-factory';

// Standard feed-in (default) - works for all draw sizes
const standardFeedIn = {
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: false,
  },
};
```

**Visual Comparison:**

```text
FEED_IN_CHAMPIONSHIP:
Main Draw                    Consolation Draw
Round 1 losers ───────────→  Consolation Round 1
Round 2 losers ───────────→  Consolation Round 2
Round 3 losers ───────────→  Consolation Round 3
Semifinal losers ─────────→  Consolation Round 4
Final loser      (2nd place, no consolation)

FIRST_MATCH_LOSER_CONSOLATION (FMLC):
Main Draw                    Consolation Draw
Round 1 losers ──────────→   Consolation
Round 2 losers (had R1 BYE)→ Consolation (FIRST_MATCHUP condition)
Round 2 losers (played R1)   (Eliminated, no consolation)
Round 3+ winners         →   Continue in MAIN
Final loser      (2nd place, no consolation)

CRITICAL: If player had BYE in R1, their first MATCH is R2
         → R2 loss counts as first match loss → feeds to consolation
         If player played in R1 and wins, then loses R2
         → R2 loss is NOT first match → eliminated, no consolation

FIRST_ROUND_LOSER_CONSOLATION (FRLC):
Main Draw                    Consolation Draw
Round 1 losers ──────────→   Consolation
Round 2+ losers              (Eliminated, no consolation)

CRITICAL: ONLY round 1 losers go to consolation
         Even if player had R1 BYE, they don't feed until they actually LOSE

16-Player FMLC with 2 BYEs:
Round 1: 7 matches (14 players) → 7 losers to consolation
         2 BYEs (players advance without playing)
Round 2: BYE holders play their FIRST MATCH
         → If they lose: consolation (first match loser)
         → If they win: continue in main
Round 2: R1 winners play their SECOND MATCH
         → If they lose: eliminated (NOT first match loser)

4-Player Draw with feedFromMainFinal: false (skipRounds = 1):
Players A, B, C, D
├─ MAIN: Only final (A vs B)
└─ CONSOLATION: C and D (didn't play round 1)

4-Player Draw with feedFromMainFinal: true (skipRounds = 0):
Players A, B, C, D
├─ MAIN:
│   ├─ Semi 1: A vs B (winner to final)
│   ├─ Semi 2: C vs D (winner to final)
│   └─ Final: Winner of Semi1 vs Winner of Semi2
└─ CONSOLATION:
    └─ Loser of Semi1 vs Loser of Semi2
    (Both losers are first match losers)
```

**Notes:**

- FMLC uses special `linkCondition: FIRST_MATCHUP` for round 2 links
- Round 2 links with FIRST_MATCHUP condition only feed players who had a BYE in round 1
- This ensures only FIRST match losers feed, not second match losers
- FRLC is simpler - only feeds from round 1, no special conditions
- For 4-player draws, FMLC needs `feedFromMainFinal: true` to ensure first round happens

---

### `roundGroupedOrder`

**Type:** `number[][]` (optional)  
**Default:** Standard sequential order  
**Purpose:** Controls the order in which losers from the same round are distributed into consolation matchUps

Each inner array represents how losers from a main draw round are grouped when feeding into consolation.

**Structure:**

```typescript
roundGroupedOrder: [
  [1], // Round 1: All losers as single group
  [1], // Round 2: All losers as single group
  [1, 2], // Round 3: Split into 2 groups (first half, second half)
  [3, 4, 1, 2], // Round 4: Split into 4 groups with specific order
  // ... more rounds
];
```

**Understanding the Numbers:**

The numbers represent which "segment" of losers feed into which part of the consolation:

- `[1]` - All losers from this round feed sequentially
- `[1, 2]` - Split into 2 groups: first half (1), second half (2)
- `[1, 2, 3, 4]` - Split into 4 groups/quarters
- `[2, 1, 4, 3]` - Split into 4 groups but reordered

**Examples:**

```javascript
// Simple 32-draw feed-in
const simpleFeedPolicy = {
  roundGroupedOrder: [
    [1], // Round 1: 16 losers feed sequentially
    [1], // Round 2: 8 losers feed sequentially
    [1, 2], // Round 3: 4 losers split into 2 groups
    [1, 2], // Round 4: 2 losers split into 2 groups
  ],
};

// Complex 128-draw feed-in
const complexFeedPolicy = {
  roundGroupedOrder: [
    [1], // Round 1: All losers together
    [1], // Round 2: All losers together
    [1, 2], // Round 3: Split into halves
    [3, 4, 1, 2], // Round 4: Quarters with specific order
    [2, 1, 4, 3, 6, 5, 8, 7], // Round 5: Eighths with alternating order
    [1], // Round 6: All losers together
  ],
};
```

**How Grouping Works:**

```javascript
// Example: Round 3 with [1, 2]
// Main draw round 3 has 4 matchUps (8 players, 4 losers)
// Losers: L1, L2, L3, L4

// With roundGroupedOrder: [1, 2]
// Group 1: L1, L2 → Feed to first consolation matchUps (TOP_DOWN or BOTTOM_UP)
// Group 2: L3, L4 → Feed to second consolation matchUps

// Example: Round 4 with [3, 4, 1, 2]
// Main draw round 4 has 8 matchUps (16 players, 8 losers)
// Losers: L1, L2, L3, L4, L5, L6, L7, L8

// With roundGroupedOrder: [3, 4, 1, 2]
// Group 3 (positions 5-6): L5, L6 → Feed first
// Group 4 (positions 7-8): L7, L8 → Feed second
// Group 1 (positions 1-2): L1, L2 → Feed third
// Group 2 (positions 3-4): L3, L4 → Feed fourth
```

**Detailed Example (64-draw):**

In a MAIN structure with 64 participants in the first round, 32 participants will be fed into the CONSOLATION structure.

```javascript
// Round 1: roundGroupedOrder: [1]
// Specifies that all 32 participants should be treated as one group

// Round 3: roundGroupedOrder: [1, 2]
// 16 participants being fed
// Split into two groups: first half and second half

// With feedProfile BOTTOM_UP:
// [1, 2] means first group feeds first
// First half (8 players): [8, 7, 6, 5, 4, 3, 2, 1]
// Second half (8 players): [16, 15, 14, 13, 12, 11, 10, 9]
// Result: [8, 7, 6, 5, 4, 3, 2, 1, 16, 15, 14, 13, 12, 11, 10, 9]

// Round 4: roundGroupedOrder: [3, 4, 1, 2]
// 8 players being fed
// Start with 3rd division: [5, 6]
// BOTTOM_UP reverses to: [6, 5]
// Full order: [6, 5, 8, 7, 2, 1, 3, 4]
```

**128-Draw Example (From Original Documentation):**

This example is sufficient to cover MAIN draw sizes up to 128. This is because the fifth element of the roundGroupedOrder array corresponds to the eighth round of a CONSOLATION structure. With a 128 MAIN structure, fed rounds contain 64, 32, 16, 8, 4 and 2 participants.

```javascript
import { TOP_DOWN, BOTTOM_UP, POLICY_TYPE_FEED_IN } from 'tods-competition-factory';

const feedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: false, // Optional - defaults to false; drawSize: 4 will not feed from main final unless true
    roundGroupedOrder: [
      [1], // Complete round TOP_DOWN
      [1], // Complete round BOTTOM_UP
      [1, 2], // 1st half BOTTOM_UP, 2nd half BOTTOM_UP
      [3, 4, 1, 2], // 3rd Qtr BOTTOM_UP, 4th Qtr BOTTOM_UP, 1st Qtr BOTTOM_UP, 2nd Qtr BOTTOM_UP
      [2, 1, 4, 3, 6, 5, 8, 7], // 1st Qtr BOTTOM_UP, 2nd Qtr BOTTOM_UP, 3rd Qtr BOTTOM_UP, 4th Qtr BOTTOM_UP
      [1], // Complete round BOTTOM_UP
    ],
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};
```

**256-Draw Example (Professional Tournament):**

```javascript
import { TOP_DOWN, BOTTOM_UP, POLICY_TYPE_FEED_IN } from 'tods-competition-factory';

const pro256FeedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1], // R1: 128 losers, single group
      [1], // R2: 64 losers, single group
      [1, 2], // R3: 32 losers, split into halves
      [3, 4, 1, 2], // R4: 16 losers, quarters reordered
      [2, 1, 4, 3, 6, 5, 8, 7], // R5: 8 losers, eighths alternating
      [1], // R6: 4 losers, single group
    ],
    roundFeedProfiles: [
      TOP_DOWN, // R1 feeds top-down
      BOTTOM_UP, // R2 feeds bottom-up
      BOTTOM_UP, // R3 feeds bottom-up
      BOTTOM_UP, // R4 feeds bottom-up
      BOTTOM_UP, // R5 feeds bottom-up
      BOTTOM_UP, // R6 feeds bottom-up
      BOTTOM_UP, // R7 feeds bottom-up
      BOTTOM_UP, // R8 feeds bottom-up
    ],
  },
};
```

**Notes:**

- More complex draws require more sophisticated grouping
- Order affects competitive balance in consolation
- Wrong grouping can create unfair matchups
- Testing recommended when customizing
- Empty array `[]` means no feeding from that round
- **Internal optimization:** The factory uses an internal method `reduceGroupOrder` to ensure the number of array elements is never greater than the number of participants being fed (handles varying draw sizes automatically)

---

### `roundFeedProfiles`

**Type:** `('TOP_DOWN' | 'BOTTOM_UP')[]` (optional)  
**Default:** Alternates TOP_DOWN (odd rounds) and BOTTOM_UP (even rounds)  
**Purpose:** Controls the direction losers feed into consolation matchUp positions

Each element corresponds to a round in the main draw and specifies how losers from that round are fed into consolation positions.

**Feed Profiles:**

- **`TOP_DOWN`:** Losers feed from top positions downward
  - First loser goes to position 1, second to position 2, etc.
  - Used for first round in many feed-in draws
- **`BOTTOM_UP`:** Losers feed from bottom positions upward
  - First loser goes to last position, second to second-last, etc.
  - Used for most subsequent rounds

**Default Behavior (no policy specified):**

```javascript
// Automatic alternation
Round 1: TOP_DOWN    (odd)
Round 2: BOTTOM_UP   (even)
Round 3: TOP_DOWN    (odd)
Round 4: BOTTOM_UP   (even)
// Pattern continues...
```

**Examples:**

```javascript
import { TOP_DOWN, BOTTOM_UP, POLICY_TYPE_FEED_IN } from 'tods-competition-factory';

// Simple 32-draw
const feedPolicy32 = {
  [POLICY_TYPE_FEED_IN]: {
    roundFeedProfiles: [
      TOP_DOWN, // Round 1 losers
      BOTTOM_UP, // Round 2 losers
      BOTTOM_UP, // Round 3 losers
      BOTTOM_UP, // Round 4 losers
    ],
  },
};

// 64-draw with custom pattern
const feedPolicy64 = {
  [POLICY_TYPE_FEED_IN]: {
    roundFeedProfiles: [
      TOP_DOWN, // Round 1
      BOTTOM_UP, // Round 2
      BOTTOM_UP, // Round 3
      TOP_DOWN, // Round 4 (break pattern)
      BOTTOM_UP, // Round 5
    ],
  },
};

// All BOTTOM_UP (conservative)
const conservativeFeed = {
  [POLICY_TYPE_FEED_IN]: {
    roundFeedProfiles: [BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};
```

**Visual Explanation:**

```text
Consolation Positions: 1, 2, 3, 4, 5, 6, 7, 8

TOP_DOWN feeding:
Loser A → Position 1
Loser B → Position 2
Loser C → Position 3
Loser D → Position 4
...

BOTTOM_UP feeding:
Loser A → Position 8
Loser B → Position 7
Loser C → Position 6
Loser D → Position 5
...
```

**Practical Example:**

```javascript
// 32-draw FEED_IN_CHAMPIONSHIP

// Main Draw Round 1: 16 matchUps → 16 losers
// With TOP_DOWN:
// Loser from matchUp 1 → Consolation position 1
// Loser from matchUp 2 → Consolation position 2
// ... → ...
// Loser from matchUp 16 → Consolation position 16

// Main Draw Round 2: 8 matchUps → 8 losers
// With BOTTOM_UP:
// Loser from matchUp 1 → Consolation position 8 (last)
// Loser from matchUp 2 → Consolation position 7
// ... → ...
// Loser from matchUp 8 → Consolation position 1 (first)
```

**Advanced Usage with groupedOrder:**

```javascript
const advancedFeedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1], // R1: Single group
      [1], // R2: Single group
      [1, 2], // R3: Two groups
      [3, 4, 1, 2], // R4: Four groups, reordered
    ],
    roundFeedProfiles: [
      TOP_DOWN, // R1: Top-down for single group
      BOTTOM_UP, // R2: Bottom-up for single group
      BOTTOM_UP, // R3: Bottom-up for both groups
      BOTTOM_UP, // R4: Bottom-up for all four groups
    ],
  },
};

// Round 3 behavior:
// Group 1 (first half) feeds BOTTOM_UP to their positions
// Group 2 (second half) feeds BOTTOM_UP to their positions
```

**Notes:**

- Array length should match number of feeding rounds
- First round typically uses TOP_DOWN
- Subsequent rounds typically use BOTTOM_UP
- Affects draw balance and potential matchups
- Must coordinate with `roundGroupedOrder` for complex draws

---

## Default Behavior (No Policy Specified)

When no feed-in policy is provided, the engine uses automatic defaults:

```javascript
// Automatic behavior
const automaticDefaults = {
  feedFromMainFinal: false,
  roundGroupedOrder: [], // Standard sequential grouping
  roundFeedProfiles: [
    // Alternates based on round number:
    // roundNumber % 2 === 1 ? TOP_DOWN : BOTTOM_UP
  ],
};
```

**Default Feed Profile Calculation:**

```javascript
// From source code: feedInLinks.ts
const feedProfile = roundFeedProfiles?.[roundNumber - 1]
  ? roundFeedProfiles[roundNumber - 1]
  : (roundNumber % 2 && TOP_DOWN) || BOTTOM_UP;

// Meaning:
// Round 1 (odd): TOP_DOWN
// Round 2 (even): BOTTOM_UP
// Round 3 (odd): TOP_DOWN
// Round 4 (even): BOTTOM_UP
// ...continues alternating
```

**When to Override Defaults:**

Override when:

- Tournament rules specify different feed patterns
- Creating custom draw types
- Optimizing for specific competitive requirements
- Large draws (128+) need sophisticated grouping

Use defaults when:

- Standard feed-in championship
- Small draws (≤64)
- No special federation requirements

---

## Usage Examples

### Basic Usage - Standard Feed-In Championship

```javascript
import tournamentEngine from 'tods-competition-factory';
import { FEED_IN_CHAMPIONSHIP, POLICY_TYPE_FEED_IN, TOP_DOWN, BOTTOM_UP } from 'tods-competition-factory';

// Create feed-in policy
const feedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: false,
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};

// Generate draw
tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: feedPolicy,
  drawSize: 32,
  participants: myParticipants,
  // ...
});
```

### FMLC (First Match Loser Consolation)

```javascript
import { FIRST_MATCH_LOSER_CONSOLATION, POLICY_TYPE_FEED_IN } from 'tods-competition-factory';

// FMLC policy - feed from main final
const fmlcPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: true,
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  policyDefinitions: fmlcPolicy,
  drawSize: 16,
  // ...
});

// Result:
// - Main structure: 16 players
// - Consolation structure: All losers including final
// - Special link condition for final loser
```

### 64-Draw with Custom Grouping

```javascript
import { FEED_IN_CHAMPIONSHIP, POLICY_TYPE_FEED_IN, TOP_DOWN, BOTTOM_UP } from 'tods-competition-factory';

const custom64FeedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: false,
    roundGroupedOrder: [
      [1], // R1: 32 losers, single group
      [1], // R2: 16 losers, single group
      [1, 2], // R3: 8 losers, split into 2
      [1, 2, 3, 4], // R4: 4 losers, split into 4
      [1, 2], // R5: 2 losers, split into 2
    ],
    roundFeedProfiles: [
      TOP_DOWN, // R1
      BOTTOM_UP, // R2
      BOTTOM_UP, // R3
      BOTTOM_UP, // R4
      BOTTOM_UP, // R5
    ],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: custom64FeedPolicy,
  drawSize: 64,
  // ...
});
```

### 128-Draw Professional Tournament

```javascript
import { FEED_IN_CHAMPIONSHIP, POLICY_TYPE_FEED_IN, TOP_DOWN, BOTTOM_UP } from 'tods-competition-factory';

const pro128FeedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1], // R1: 64 losers
      [1], // R2: 32 losers
      [1, 2], // R3: 16 losers, halves
      [3, 4, 1, 2], // R4: 8 losers, quarters reordered
      [2, 1, 4, 3, 6, 5, 8, 7], // R5: 4 losers, eighths alternating
      [1], // R6: 2 losers, single group
    ],
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: pro128FeedPolicy,
  drawSize: 128,
  seedsCount: 32,
  // ...
});
```

### 256-Draw with Complex Grouping

```javascript
import { FEED_IN_CHAMPIONSHIP, POLICY_TYPE_FEED_IN, TOP_DOWN, BOTTOM_UP } from 'tods-competition-factory';

const pro256FeedPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1], // R1: 128 losers
      [1], // R2: 64 losers
      [1, 2], // R3: 32 losers
      [3, 4, 1, 2], // R4: 16 losers
      [2, 1, 4, 3, 6, 5, 8, 7], // R5: 8 losers
      [1], // R6: 4 losers
    ],
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: pro256FeedPolicy,
  drawSize: 256,
  seedsCount: 64,
  // ...
});
```

### Feed-In to Specific Round

```javascript
import { FEED_IN_CHAMPIONSHIP_TO_SF, POLICY_TYPE_FEED_IN, TOP_DOWN, BOTTOM_UP } from 'tods-competition-factory';

// Feed-in only up to semifinals
const feedToSFPolicy = {
  [POLICY_TYPE_FEED_IN]: {
    roundFeedProfiles: [
      TOP_DOWN,
      BOTTOM_UP,
      BOTTOM_UP,
      // Only 3 rounds feed (up to SF)
    ],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  policyDefinitions: feedToSFPolicy,
  drawSize: 32,
  // ...
});

// Result:
// - Rounds 1-3 losers feed to consolation
// - Semifinal and final losers do NOT feed
// - Consolation ends at specific round
```

### Using with Other Policies

```javascript
import {
  FEED_IN_CHAMPIONSHIP,
  POLICY_TYPE_FEED_IN,
  POLICY_TYPE_SEEDING,
  POLICY_SEEDING_ITF,
  TOP_DOWN,
  BOTTOM_UP,
} from 'tods-competition-factory';

// Combine feed-in with seeding policy
const combinedPolicies = {
  ...POLICY_SEEDING_ITF, // ITF seeding
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [[1], [1], [1, 2], [1, 2, 3, 4]],
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: combinedPolicies,
  drawSize: 64,
  seedsCount: 16,
  // ...
});
```

---

## Real-World Scenarios

### Scenario 1: Professional 64-Draw Feed-In Championship

```javascript
import tournamentEngine from 'tods-competition-factory';
import {
  FEED_IN_CHAMPIONSHIP,
  POLICY_TYPE_FEED_IN,
  POLICY_TYPE_SEEDING,
  SEPARATE,
  TOP_DOWN,
  BOTTOM_UP
} from 'tods-competition-factory';

// Setup: Professional tournament with 64 players
const players = [...]; // 64 professional players

// Create comprehensive policy
const proTournamentPolicy = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: { positioning: SEPARATE },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: false, // Pro tournament - unique seeds
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 }
    ]
  },
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1],         // R1: 32 losers, all together
      [1],         // R2: 16 losers, all together
      [1, 2],      // R3: 8 losers, split into halves
      [1, 2, 3, 4], // R4: 4 losers, split into quarters
      [1, 2]       // R5: 2 losers, split into halves
    ],
    roundFeedProfiles: [
      TOP_DOWN,    // R1 feeds from top
      BOTTOM_UP,   // R2 feeds from bottom
      BOTTOM_UP,   // R3 feeds from bottom
      BOTTOM_UP,   // R4 feeds from bottom
      BOTTOM_UP    // R5 feeds from bottom
    ]
  }
};

// Create tournament
tournamentEngine.newTournamentRecord({
  tournamentName: 'Professional Open'
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Men Singles'
}).eventId;

// Add entries
tournamentEngine.addEventEntries({
  eventId,
  participantIds: players.map(p => p.participantId)
});

// Generate draw
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: proTournamentPolicy,
  drawSize: 64,
  seedsCount: 16
});

// Result:
// - Main structure: 64 players, 16 seeds (SEPARATE positioning)
// - Consolation structure: All losers except finalist and champion
// - Round 1: 32 losers feed TOP_DOWN
// - Round 2-5: Losers feed BOTTOM_UP with grouping
// - Consolation champion determined (3rd place equivalent)
```

---

### Scenario 2: Club Tournament FMLC (First MATCH Losers Get Second Chance)

```javascript
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  POLICY_TYPE_SEEDING,
  CLUSTER
} from 'tods-competition-factory';

// 14 club players (16 draw with 2 BYEs)
const clubPlayers = [...]; // 14 players

// Club FMLC policy
const clubFMLCPolicy = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: { positioning: CLUSTER },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: false,
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 }
    ]
  }
};

// Create tournament
tournamentEngine.newTournamentRecord({
  tournamentName: 'Club Championships'
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Singles'
}).eventId;

tournamentEngine.addEventEntries({
  eventId,
  participantIds: clubPlayers.map(p => p.participantId)
});

// Generate FMLC draw
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  policyDefinitions: clubFMLCPolicy,
  drawSize: 16,
  seedsCount: 4
});

// Result:
// - Main structure: 16 positions, 14 players, 2 BYEs
// - Consolation structure: First MATCH losers
//
// What happens:
// Round 1: 7 matches (14 players) → 7 losers feed to consolation
//          2 BYEs → 2 players advance to round 2 without playing
//
// Round 2:
//   - 7 R1 winners play matches (second match for them)
//     → If they lose: ELIMINATED (not first match loser)
//   - 2 BYE holders play their FIRST MATCH
//     → If they lose: CONSOLATION (first match loser)
//     → Special linkCondition: FIRST_MATCHUP ensures this
//
// Key Insight:
// - Total consolation players: 7 (R1) + up to 2 (R2 BYE holders who lose)
// - Maximum 9 players can be in consolation (if both BYE holders lose)
// - Players who played R1 and lose R2 do NOT go to consolation
// - FMLC distinguishes between "first MATCH" and "first ROUND"
```

---

### Scenario 3: College Conference Championship (128 Draw)

```javascript
import {
  FEED_IN_CHAMPIONSHIP,
  POLICY_TYPE_FEED_IN,
  POLICY_TYPE_SEEDING,
  SEPARATE,
  TOP_DOWN,
  BOTTOM_UP
} from 'tods-competition-factory';

// 128 college players from conference
const collegePlayers = [...]; // 128 players

// College conference policy
const collegePolicy = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: { positioning: SEPARATE },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 128, minimumParticipantCount: 96, seedsCount: 32 }
    ]
  },
  [POLICY_TYPE_FEED_IN]: {
    roundGroupedOrder: [
      [1],                      // R1: 64 losers
      [1],                      // R2: 32 losers
      [1, 2],                   // R3: 16 losers, halves
      [3, 4, 1, 2],             // R4: 8 losers, quarters reordered
      [2, 1, 4, 3, 6, 5, 8, 7], // R5: 4 losers, eighths alternating
      [1]                       // R6: 2 losers
    ],
    roundFeedProfiles: [
      TOP_DOWN,
      BOTTOM_UP,
      BOTTOM_UP,
      BOTTOM_UP,
      BOTTOM_UP,
      BOTTOM_UP,
      BOTTOM_UP
    ]
  }
};

// Create tournament
tournamentEngine.newTournamentRecord({
  tournamentName: 'Conference Championships'
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Men Singles'
}).eventId;

// Generate draw
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: collegePolicy,
  participants: collegePlayers,
  drawSize: 128,
  seedsCount: 32
});

// Result:
// - Main: 128 players, 32 seeds
// - Consolation: Large structure with sophisticated grouping
// - Complex feed patterns ensure competitive balance
// - Consolation winner receives recognition (All-Conference honors)
```

---

### Scenario 4: Club Tournament Feed-In (32 Draw)

```javascript
import {
  FEED_IN_CHAMPIONSHIP,
  POLICY_TYPE_FEED_IN,
  POLICY_TYPE_SEEDING,
  CLUSTER,
  TOP_DOWN,
  BOTTOM_UP,
} from 'tods-competition-factory';

// 28 club members
const clubMembers = [
  // 28 players with club rankings
];

// Simple club policy
const clubPolicy = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: { positioning: CLUSTER },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: false,
    drawSizeProgression: true,
    seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
  },
  [POLICY_TYPE_FEED_IN]: {
    // Use default grouping (no roundGroupedOrder)
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP, BOTTOM_UP],
  },
};

// Create tournament
tournamentEngine.newTournamentRecord({
  tournamentName: 'Club Championships',
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Open Singles',
}).eventId;

tournamentEngine.addEventEntries({
  eventId,
  participantIds: clubMembers.map((p) => p.participantId),
});

// Generate draw
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: clubPolicy,
  drawSize: 32,
  seedsCount: 8,
  // 28 participants → 4 BYEs
});

// Result:
// - Main: 32 positions, 28 players, 8 seeds, 4 BYEs
// - Consolation: All losers except finalists
// - Simple feed pattern appropriate for club level
// - Everyone except top 2 finishers plays in consolation
```

---

## Notes

### Feed Direction Impact

**TOP_DOWN vs BOTTOM_UP** affects matchup spacing:

```text
Consolation Bracket (8 positions):

TOP_DOWN:                  BOTTOM_UP:
1 ─┬─ M1                  8 ─┬─ M1
2 ─┘                      7 ─┘
3 ─┬─ M2                  6 ─┬─ M2
4 ─┘                      5 ─┘
5 ─┬─ M3                  4 ─┬─ M3
6 ─┘                      3 ─┘
7 ─┬─ M4                  2 ─┬─ M4
8 ─┘                      1 ─┘

Effect on competitive balance and bracket aesthetics
```

---

### Grouped Order Strategy

**Why use complex groupedOrder?**

1. **Competitive Balance:** Prevents strength clustering
2. **Draw Aesthetics:** Better visual distribution
3. **Fairness:** Equal difficulty paths through consolation
4. **Federation Standards:** ITF/USTA specifications

**Simple vs Complex:**

```javascript
// Simple (small draws ≤32)
roundGroupedOrder: [[1], [1], [1, 2]];

// Complex (large draws 128+)
roundGroupedOrder: [[1], [1], [1, 2], [3, 4, 1, 2], [2, 1, 4, 3, 6, 5, 8, 7], [1]];
```

---

### Link Structure

Feed-in draws create **DrawLink** objects:

```typescript
{
  linkType: 'LOSER',
  source: {
    structureId: 'main-structure-id',
    roundNumber: 3
  },
  target: {
    structureId: 'consolation-structure-id',
    roundNumber: 2,
    feedProfile: 'BOTTOM_UP',
    groupedOrder: [1, 2]
  },
  linkCondition: 'FIRST_MATCHUP' // Optional, for FMLC
}
```

**Special Link Conditions:**

- `FIRST_MATCHUP`: Used in FMLC for round 2 links
- Only feeds players from round 2 if it was their FIRST match (they had a BYE in round 1)
- Distinguishes between "first match losers" and "second match losers" in round 2
- Players who played in round 1 and lose in round 2 do NOT feed (eliminated)

---

### Round Matching

**How rounds map from main to consolation:**

```javascript
// 32-draw example:
Main Round 1 (16 matchUps) → Consolation Round 1 (16 positions)
Main Round 2 (8 matchUps)  → Consolation Round 1 (fills remaining)
Main Round 3 (4 matchUps)  → Consolation Round 2
Main Round 4 (2 matchUps)  → Consolation Round 3
Main Round 5 (1 matchUp)   → Does not feed (final)

// Formula after first two rounds:
targetRound = roundNumber <= 2
  ? roundNumber
  : (roundNumber - 2) * 2 + 2
```

---

### Performance Considerations

**Large Draws (128+):**

- Complex groupedOrder increases calculation time
- Link generation is O(n) where n = number of rounds
- Pre-calculate policies for frequently used draw sizes

**Testing Recommendations:**

- Test feed patterns before tournament
- Verify all losers are correctly placed
- Check consolation structure integrity

---

### Validation Rules

The engine validates:

1. **roundFeedProfiles:**
   - Length should match feeding rounds count
   - Each value must be TOP_DOWN or BOTTOM_UP

2. **roundGroupedOrder:**
   - Each array should have valid group numbers
   - Group numbers should be sequential or follow pattern
   - Empty arrays allowed (no feeding from that round)

3. **feedFromMainFinal:**
   - Must be boolean
   - Affects final round link creation

4. **Draw Type Compatibility:**
   - Policy only applies to feed-in draw types
   - Warning if used with non-applicable draw type

---

### Common Pitfalls

**1. Wrong Feed Direction:**

```javascript
// ❌ All TOP_DOWN (not recommended)
roundFeedProfiles: [TOP_DOWN, TOP_DOWN, TOP_DOWN];

// ✅ Typical pattern
roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP];
```

**2. Mismatched Array Lengths:**

```javascript
// ❌ Mismatch
roundGroupedOrder: [[1], [1], [1, 2]],  // 3 rounds
roundFeedProfiles: [TOP_DOWN, BOTTOM_UP] // 2 rounds - Missing!

// ✅ Matched
roundGroupedOrder: [[1], [1], [1, 2]],
roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP]
```

**3. Complex Grouping without Testing:**

```javascript
// ❌ Complex pattern without validation
roundGroupedOrder: [[2, 1, 4, 3, 6, 5, 8, 7]],

// ✅ Test with actual draw
// Use engine's validation or create test draw first
```

**4. Using with Wrong Draw Type:**

```javascript
// ❌ Feed policy with elimination
tournamentEngine.generateDrawDefinition({
  drawType: 'SINGLE_ELIMINATION', // No consolation!
  policyDefinitions: feedPolicy, // Policy ignored
});

// ✅ Feed policy with feed-in draw
tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: feedPolicy,
});
```

---

## Integration with Other Policies

Feed-in policy works with:

- **Seeding Policy:** Seeds placed in main, affects who feeds when
- **Progression Policy:** Consolation advancement rules
- **Scoring Policy:** Same scoring applies to consolation
- **Position Actions Policy:** Position restrictions apply
- **MatchUp Actions Policy:** MatchUp constraints apply

**Example Integration:**

```javascript
import {
  FEED_IN_CHAMPIONSHIP,
  POLICY_SEEDING_ITF,
  POLICY_TYPE_FEED_IN,
  TOP_DOWN,
  BOTTOM_UP,
} from 'tods-competition-factory';

const fullPolicies = {
  ...POLICY_SEEDING_ITF,
  [POLICY_TYPE_FEED_IN]: {
    feedFromMainFinal: false,
    roundFeedProfiles: [TOP_DOWN, BOTTOM_UP, BOTTOM_UP],
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: fullPolicies,
  drawSize: 32,
});
```

---

## Related Methods

### Query Methods

#### `getStructureLinks()`

Retrieves links between structures.

```javascript
import { getStructureLinks } from 'tods-competition-factory';

const { links } = getStructureLinks({
  drawDefinition,
  structureId: mainStructureId,
});

// Returns array of DrawLink objects showing feed connections
```

#### `getAllStructureMatchUps()`

Gets all matchUps from a structure (main or consolation).

```javascript
tournamentEngine.getAllStructureMatchUps({
  drawId,
  structureId: consolationStructureId,
});
```

---

### Mutation Methods

#### `generateDrawDefinition()`

Primary method for creating feed-in draws.

```javascript
tournamentEngine.generateDrawDefinition({
  drawType: FEED_IN_CHAMPIONSHIP,
  policyDefinitions: { [POLICY_TYPE_FEED_IN]: feedPolicy },
  drawSize: 64,
  // ...
});
```

---

## Related Concepts

- **Feed-In Draws** - Draw types where losers feed into consolation structures
- **Draw Structures** - Main and consolation structure organization
- **Draw Links** - How losers connect from main to consolation via links
- **Consolation Draws** - Secondary competition for eliminated players
- **[Seeding Policy](seedingPolicy.md)** - How seeding interacts with feed-in draws

---

## Summary

The **Feed-In Policy** controls how losers transition from main to consolation structures in feed-in draw types:

**Three Key Attributes:**

1. **`feedFromMainFinal`** - Whether final loser feeds to consolation
2. **`roundGroupedOrder`** - How losers from same round are grouped and ordered
3. **`roundFeedProfiles`** - Direction (TOP_DOWN/BOTTOM_UP) for each round

**Applicable to:**

- FEED_IN_CHAMPIONSHIP (all variants)
- FIRST_MATCH_LOSER_CONSOLATION
- MODIFIED_FEED_IN_CHAMPIONSHIP

**Default Behavior:**

- Alternates TOP_DOWN (odd rounds) and BOTTOM_UP (even rounds)
- Sequential grouping (no complex reordering)
- Final loser does NOT feed

**Best Practices:**

- Use defaults for draws ≤32
- Customize for larger draws (64+)
- Test complex grouping patterns
- Match array lengths (groupedOrder and feedProfiles)
- Coordinate with seeding policy

The policy ensures fair consolation structures where all players (except top 2) have opportunity to compete for consolation title, maintaining competitive balance and player satisfaction throughout the tournament.
