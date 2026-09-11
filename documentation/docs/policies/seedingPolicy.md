# Seeding Policy

## Overview

The **Seeding Policy** controls how seeds are positioned in draw structures, how many seeds are allowed based on draw size and participant count, and how seeds behave across different draw types. This policy is critical for ensuring fair tournament structures and is used by professional federations like USTA and ITF.

---

## Reaching the built-in policies

The policy fixtures are reached through the `fixtures` namespace. There are **no** root-level
`POLICY_*` exports, and no default export:

```javascript
import { drawDefinitionConstants, fixtures, policyConstants, tournamentEngine } from 'tods-competition-factory';

const { POLICY_SEEDING_DEFAULT, POLICY_SEEDING_ITF, POLICY_SEEDING_BYES } = fixtures.policies;
const { POLICY_TYPE_SEEDING } = policyConstants;
const { CLUSTER, SEPARATE, WATERFALL } = drawDefinitionConstants;
```

<!-- doc-imports:ignore -->

```javascript
// These do NOT work — each resolves to `undefined`:
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_ITF } = fixtures.policies; // ✗
import { policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_SEEDING } = policyConstants; // ✗
import { drawDefinitionConstants } from 'tods-competition-factory';
const { CLUSTER } = drawDefinitionConstants; // ✗
import { tournamentEngine } from 'tods-competition-factory'; // ✗ no default export
```

An `undefined` policy fails **silently**: `policyDefinitions: undefined` reads as "no policy
supplied", so generation falls back to its own defaults and nothing reports an error. A draw that
looks fine can be seeded by the wrong rules.

---

## Policy Structure

```typescript
{
  seeding: {
    policyName?: string;

    seedingProfile?: {
      positioning?: 'CLUSTER' | 'ADJACENT' | 'SEPARATE' | 'WATERFALL';
      drawTypes?: {
        [drawType: string]: {
          positioning: 'CLUSTER' | 'ADJACENT' | 'SEPARATE' | 'WATERFALL';
        };
      };
      groupSeedingThreshold?: number;
      nonRandom?: boolean;
    };

    validSeedPositions?: {
      ignore?: boolean;
      strict?: boolean;
    };

    duplicateSeedNumbers?: boolean;
    drawSizeProgression?: boolean;
    containerByesIgnoreSeeding?: boolean;

    seedsCountThresholds: Array<{
      drawSize: number;
      minimumParticipantCount: number;
      seedsCount: number;
    }>;
  }
}
```

---

## Attributes

### `policyName`

**Type:** `string` (optional)  
**Purpose:** Human-readable name for the policy

Provides a descriptive name for the seeding policy, useful for logging, debugging, and policy selection in administrative interfaces.

**Example:**

```javascript
{
  policyName: 'USTA SEEDING';
}
```

**Notes:**

- Used in built-in policies: `'USTA SEEDING'`, `'ITF SEEDING'`, `'SEED_BYES'`
- Purely informational - does not affect behavior

---

### `seedingProfile`

**Type:** `object` (optional)  
**Purpose:** Controls how seeds are positioned in draw structures

The seeding profile determines the positioning pattern for seeds throughout the draw. Different positioning strategies are used by different federations and for different draw types.

#### `seedingProfile.positioning`

**Type:** `'CLUSTER' | 'ADJACENT' | 'SEPARATE' | 'WATERFALL'`  
**Default:** `'SEPARATE'`

Controls the default seed positioning pattern for elimination draws:

- **`SEPARATE` (USTA style):** Seeds are separated to opposite ends of position groups
  - Top half: seeds placed at TOP of groups
  - Bottom half: seeds placed at BOTTOM of groups
  - Seeds 3-4 placed at positions to maximize separation
  - Seeds 5-8 placed to maximize separation within quarters

- **`CLUSTER` (ITF style):** Seeds alternate between top and bottom of groups
  - Creates clustered seed positions
  - Seeds may be adjacent to each other
  - Pattern alternates every other seed block
- **`ADJACENT`:** Synonym for `CLUSTER`
  - Exactly the same as CLUSTER positioning
  - Useful for clearer semantic meaning in some contexts

- **`WATERFALL` (Round Robin):** Seeds distributed sequentially across groups
  - Seed 1 in Group 1, Seed 2 in Group 2, etc.
  - Used primarily for Round Robin structures
  - Ensures even distribution of strength

**Examples:**

```javascript
// USTA/SEPARATE positioning (default)
{
  seedingProfile: {
    positioning: 'SEPARATE';
  }
}

// ITF/CLUSTER positioning
{
  seedingProfile: {
    positioning: 'CLUSTER';
  }
}

// ADJACENT positioning (same as CLUSTER)
{
  seedingProfile: {
    positioning: 'ADJACENT';
  }
}

// WATERFALL positioning (for Round Robin)
{
  seedingProfile: {
    positioning: 'WATERFALL';
  }
}
```

**Visual Comparison (32 draw):**

```text
SEPARATE (USTA):          CLUSTER/ADJACENT (ITF):
Seed 1: Position 1        Seed 1: Position 1
Seed 2: Position 32       Seed 2: Position 32
Seed 3: Position 9        Seed 3: Position 16
Seed 4: Position 24       Seed 4: Position 17
Seed 5: Position 5        Seed 5: Position 8
Seed 6: Position 28       Seed 6: Position 9
Seed 7: Position 13       Seed 7: Position 24
Seed 8: Position 20       Seed 8: Position 25
```

**Notes:**

- SEPARATE: Seeds never adjacent, maximizes separation
- CLUSTER/ADJACENT: Seeds may be adjacent, alternating pattern
- WATERFALL: Only for Round Robin structures
- Positioning affects competitive balance and viewer experience

---

#### `seedingProfile.drawTypes`

**Type:** `object` (optional)  
**Purpose:** Override positioning for specific draw types

Allows different positioning strategies for different draw types within the same tournament.

**Structure:**

```typescript
drawTypes: {
  [drawType: string]: {
    positioning: 'CLUSTER' | 'ADJACENT' | 'SEPARATE' | 'WATERFALL';
  }
}
```

**Example:**

```javascript
{
  seedingProfile: {
    positioning: 'SEPARATE', // Default for elimination
    drawTypes: {
      ROUND_ROBIN_WITH_PLAYOFF: { positioning: 'WATERFALL' },
      ROUND_ROBIN: { positioning: 'WATERFALL' }
    }
  }
}
```

**Common Use Cases:**

```javascript
// USTA style: SEPARATE for elimination, WATERFALL for Round Robin
import { drawDefinitionConstants } from 'tods-competition-factory';
const { ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SEPARATE, WATERFALL } = drawDefinitionConstants;

const seedingPolicy = {
  seeding: {
    seedingProfile: {
      positioning: SEPARATE,
      drawTypes: {
        [ROUND_ROBIN_WITH_PLAYOFF]: { positioning: WATERFALL },
        [ROUND_ROBIN]: { positioning: WATERFALL },
      },
    },
  },
};

// ITF style: CLUSTER for all draw types
const itfSeeding = {
  seeding: {
    seedingProfile: {
      positioning: 'CLUSTER',
    },
  },
};

// Mixed positioning
const mixedSeeding = {
  seeding: {
    seedingProfile: {
      positioning: 'SEPARATE',
      drawTypes: {
        ROUND_ROBIN: { positioning: 'WATERFALL' },
        FEED_IN_CHAMPIONSHIP: { positioning: 'CLUSTER' },
      },
    },
  },
};
```

**Notes:**

- Draw type specific positioning overrides default positioning
- Round Robin draws typically use WATERFALL positioning
- Elimination draws typically use SEPARATE or CLUSTER
- If no override specified, default positioning is used

---

#### `seedingProfile.groupSeedingThreshold`

**Type:** `number` (optional)  
**Purpose:** Controls seed value handling in Round Robin groups

When generating Round Robin draws, this threshold determines how seed values are processed for group seeding calculations.

**Example:**

```javascript
{
  seedingProfile: {
    groupSeedingThreshold: 1000;
  }
}
```

**Notes:**

- Advanced feature - rarely needed in standard tournament operations
- Used internally for Round Robin seed distribution calculations
- Leave undefined for default behavior

---

#### `seedingProfile.nonRandom`

**Type:** `boolean` (optional)  
**Default:** `false`

Controls whether seed positioning uses deterministic (non-random) placement within seed blocks.

**Example:**

```javascript
{
  seedingProfile: {
    positioning: 'CLUSTER',
    nonRandom: true
  }
}
```

**Use Cases:**

- Testing and validation (deterministic results)
- Qualification structures where positions must be predictable
- Audit requirements for reproducibility

**Notes:**

- When `false` (default): Seeds randomized within their block
- When `true`: Seeds placed deterministically
- Does not affect which positions are valid for seeds, only their assignment order

---

### `validSeedPositions`

**Type:** `object` (optional)  
**Purpose:** How much latitude an operator has to place a seed by hand

:::caution What this does NOT control
This does **not** decide where automated positioning puts seeds. That is
[`seedingProfile.positioning`](#seedingprofile), and both the USTA and ITF policies specify it —
differently (`SEPARATE` vs `CLUSTER`). `validSeedPositions` is consulted only by
`isValidSeedPosition`, which is called when **assigning a seeded participant to a drawPosition**
(rejecting with `INVALID_DRAW_POSITION_FOR_SEEDING`) and when deciding whether the `SEED_VALUE` and
`REMOVE_SEED` position actions are **offered** at a position.
:::

There are three states, not two:

| setting            | a seed may be placed                                   | used by                                                                      |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `{ ignore: true }` | in **any** draw position                               | `POLICY_SEEDING_DEFAULT` (USTA), `POLICY_SEEDING_ITF`, `POLICY_SEEDING_BYES` |
| **absent**         | in any position belonging to **some** valid seed block | the default                                                                  |
| `{ strict: true }` | only in positions of **that seed's own** block         | —                                                                            |

The middle row is the one that is easy to get wrong. With the key absent, seed 1 is not pinned to
position 1 — it may sit anywhere in the union of all seed-block positions. Only `strict: true`
confines a seed to its own block.

**Examples:**

```javascript
import { fixtures } from 'tods-competition-factory';

const { POLICY_SEEDING_ITF, POLICY_SEEDING_DEFAULT } = fixtures.policies;
// Both carry validSeedPositions: { ignore: true } — hand placement anywhere.

// Confine hand placement to seed-block positions by OMITTING the key (see
// "Composing a variant" below — do not hand-copy a policy to drop one key).

// Confine each seed to its own block:
const pinned = { seeding: { validSeedPositions: { strict: true } } };
```

**Use Cases:**

```javascript
// Pre-seeded tournament (manual placement)
const manualSeeding = {
  seeding: {
    validSeedPositions: { ignore: true },
    seedingProfile: { positioning: 'SEPARATE' },
  },
};

// Standard automated seeding (strict validation)
const autoSeeding = {
  seeding: {
    validSeedPositions: { ignore: false },
    seedingProfile: { positioning: 'CLUSTER' },
  },
};
```

**Notes:**

- Most professional federations use `ignore: true` for flexibility
- Does not affect which seeds are assigned, nor where automated positioning places them — only
  whether a given hand placement is accepted, and whether the seed actions are offered

---

### `duplicateSeedNumbers`

**Type:** `boolean` (optional)  
**Default:** `false`

Allows multiple participants to share the same seed number.

**When `true`:**

- Multiple participants can have same seed value (e.g., three "Seed 5s")
- Useful when player rankings are tied
- Common in ITF and USTA tournaments
- Seeds still placed in appropriate seed blocks

**When `false`:**

- Each seed number must be unique
- Traditional seeding approach

**Examples:**

```javascript
// Allow duplicate seeds (ITF/USTA standard)
{
  duplicateSeedNumbers: true;
}

// Traditional unique seeds
{
  duplicateSeedNumbers: false;
}
```

**Real-World Scenario:**

```javascript
// ITF Junior Tournament - players with same ranking
const participants = [
  { participantId: '1', seedValue: 1 }, // Rank 1
  { participantId: '2', seedValue: 2 }, // Rank 2
  { participantId: '3', seedValue: 3 }, // Rank 3 (tied)
  { participantId: '4', seedValue: 3 }, // Rank 3 (tied)
  { participantId: '5', seedValue: 3 }, // Rank 3 (tied)
  { participantId: '6', seedValue: 6 }, // Rank 6
];

const policy = {
  seeding: {
    duplicateSeedNumbers: true,
    seedingProfile: { positioning: 'CLUSTER' },
  },
};

// All three participants with seedValue 3 are placed in seed block 3-4-5-6
```

**Notes:**

- Required for tournaments using rating-based seeding where ties occur
- Both POLICY_SEEDING_ITF and POLICY_SEEDING_DEFAULT set `true`
- **Absent means `true`, not `false`.** The engine reads
  `typeof duplicateSeedNumbers === 'boolean' ? duplicateSeedNumbers : true`, so omitting the key is
  identical to setting it `true`; only an explicit `false` requires unique seed numbers. The
  built-ins set it explicitly to document intent, not to change behavior
- Engine handles randomization of duplicate seeds within their blocks

---

### `drawSizeProgression`

**Type:** `boolean` (optional)  
**Default:** `false`

Automatically adjusts seeds count based on the minimum draw size that accommodates the participant count, rather than the actual participant count.

**When `true`:**

- Seeds count determined by next power-of-2 draw size
- Example: 25 participants → uses 32 draw size for seed calculation
- Results in more seeds for draws with many BYEs

**When `false`:**

- Seeds count determined by actual participant count
- More conservative seeding approach

**Examples:**

```javascript
// Progressive seeding (more seeds with BYEs)
{
  drawSizeProgression: true,
  seedsCountThresholds: [
    { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }
  ]
}

// Conservative seeding
{
  drawSizeProgression: false,
  seedsCountThresholds: [
    { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }
  ]
}
```

**Behavior Comparison:**

```javascript
// Scenario: 25 participants in draw
// seedsCountThresholds: { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }

// With drawSizeProgression: true
// → Draw size becomes 32 (next power of 2)
// → 25 >= 24 (threshold met for 32 draw)
// → 8 seeds assigned

// With drawSizeProgression: false
// → Uses 25 participants directly
// → 25 >= 24 (threshold met)
// → 8 seeds assigned

// Scenario: 23 participants in draw
// With drawSizeProgression: true
// → Draw size becomes 32
// → 23 < 24 (threshold NOT met for 32 draw)
// → Falls back to threshold for drawSize: 16 (if exists)

// With drawSizeProgression: false
// → Uses 23 participants directly
// → 23 < 24 (threshold NOT met)
// → Falls back to previous threshold
```

**Notes:**

- Used by both ITF and USTA policies (`true`)
- Affects tournaments with significant BYE count
- More seeds = better competitive balance but more complex draws

---

### `containerByesIgnoreSeeding`

**Type:** `boolean` (optional)  
**Default:** `false`

Controls whether BYEs in container structures (Round Robin with Playoff) respect seed positions.

**When `true`:**

- BYEs are placed randomly or by other criteria
- Seed positions do not influence BYE placement
- Used in POLICY_SEEDING_BYES

**When `false` (default):**

- BYEs are placed to avoid seeded positions where possible
- Protects seeds from BYE positions
- Standard behavior for most tournaments

**Examples:**

```javascript
// BYEs ignore seeding (BYES policy)
{
  containerByesIgnoreSeeding: true,
  seedingProfile: { positioning: 'CLUSTER' }
}

// BYEs respect seeding (default)
{
  containerByesIgnoreSeeding: false,
  seedingProfile: { positioning: 'SEPARATE' }
}
```

**Use Cases:**

```javascript
// Round Robin with Playoff - BYEs ignore seeds
import { drawDefinitionConstants } from 'tods-competition-factory';
const { ROUND_ROBIN_WITH_PLAYOFF } = drawDefinitionConstants;

const policy = {
  seeding: {
    containerByesIgnoreSeeding: true,
    seedingProfile: {
      positioning: 'SEPARATE',
      drawTypes: {
        [ROUND_ROBIN_WITH_PLAYOFF]: { positioning: 'WATERFALL' },
      },
    },
  },
};

tournamentEngine.generateDrawDefinition({
  drawType: ROUND_ROBIN_WITH_PLAYOFF,
  policyDefinitions: policy,
  drawSize: 16,
  // ...
});
```

**Notes:**

- Only affects CONTAINER and ITEM structure types
- Primarily used in Round Robin with Playoff draws
- Standard elimination draws use different BYE placement logic
- POLICY_SEEDING_BYES is the only built-in policy using this

---

### `seedsCountThresholds`

**Type:** `Array<{ drawSize: number; minimumParticipantCount: number; seedsCount: number }>`  
**Required:** Yes

Defines how many seeds are allowed for each draw size based on participant count.

**Structure:**

```typescript
seedsCountThresholds: [
  {
    drawSize: number;                // Target draw size (power of 2)
    minimumParticipantCount: number; // Minimum participants needed
    seedsCount: number;              // Number of seeds allowed
  },
  // ...
]
```

**Logic:**

1. Engine determines draw size from participant count (next power of 2)
2. Finds matching `drawSize` in thresholds
3. Checks if participant count meets `minimumParticipantCount`
4. If yes: allows `seedsCount` seeds
5. If no: checks next lower threshold

**Standard USTA Thresholds:**

```javascript
seedsCountThresholds: [
  { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
  { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
  { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
  { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 },
  { drawSize: 128, minimumParticipantCount: 96, seedsCount: 32 },
  { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 },
];
```

**Standard ITF Thresholds:**

```javascript
seedsCountThresholds: [
  { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
  { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
  { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
  { drawSize: 64, minimumParticipantCount: 48, seedsCount: 16 },
  { drawSize: 128, minimumParticipantCount: 97, seedsCount: 32 }, // Lower threshold
  { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 },
];
```

**Examples:**

```javascript
// Conservative seeding (more participants required)
const conservativePolicy = {
  seeding: {
    seedsCountThresholds: [
      { drawSize: 32, minimumParticipantCount: 28, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 56, seedsCount: 16 },
    ],
  },
};

// Progressive seeding (fewer participants required)
const progressivePolicy = {
  seeding: {
    seedsCountThresholds: [
      { drawSize: 32, minimumParticipantCount: 20, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 40, seedsCount: 16 },
    ],
  },
};

// Club tournament (simpler)
const clubPolicy = {
  seeding: {
    seedsCountThresholds: [
      { drawSize: 8, minimumParticipantCount: 6, seedsCount: 2 },
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
    ],
  },
};
```

**How It Works:**

```javascript
// Scenario: 50 participants
// Engine calculates: drawSize = 64 (next power of 2)

// With USTA policy:
// Checks: drawSize: 64, minimumParticipantCount: 48
// 50 >= 48 ✓
// Result: 16 seeds allowed

// Scenario: 45 participants
// Engine calculates: drawSize = 64

// With USTA policy:
// Checks: drawSize: 64, minimumParticipantCount: 48
// 45 < 48 ✗
// Falls back to: drawSize: 32, minimumParticipantCount: 24
// 45 >= 24 ✓
// Result: 8 seeds allowed
```

**Notes:**

- Thresholds must be sorted by drawSize (ascending)
- Draw sizes must be powers of 2
- Engine automatically finds appropriate threshold
- If no threshold met, minimum seeding is used (typically 2 seeds)

---

## Built-in Seeding Policies

The factory ships three pre-configured seeding policies. A federation whose rules differ from all three should **compose** a variant rather than hand-copy one — see [Composing a variant](#composing-a-variant).

### Comparison Table

| Attribute                      | USTA (DEFAULT)   | ITF             | BYES            |
| ------------------------------ | ---------------- | --------------- | --------------- |
| **policyName**                 | 'USTA SEEDING'   | 'ITF SEEDING'   | 'SEED_BYES'     |
| **positioning**                | SEPARATE         | CLUSTER         | CLUSTER         |
| **validSeedPositions.ignore**  | `true`           | `true`          | `true`          |
| **duplicateSeedNumbers**       | `true`           | `true`          | `true`          |
| **drawSizeProgression**        | `true`           | `true`          | `true`          |
| **containerByesIgnoreSeeding** | (absent)         | (absent)        | `true`          |
| **drawTypes**                  | WATERFALL for RR | (none)          | (none)          |
| **128-draw threshold**         | 96 participants  | 97 participants | 97 participants |

All three seed to the same depth: `drawSize / 4` at every threshold. That matters when a national
rule seeds more deeply — none of the three expresses it, which is what `seedsCountThresholds` and a
composed variant are for.

---

### POLICY_SEEDING_DEFAULT (USTA)

**Purpose:** United States Tennis Association standard seeding  
**Positioning:** SEPARATE (seeds maximally separated)  
**Use Case:** USTA tournaments, US Open, most US-based tournaments

**Full Policy:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_DEFAULT } = fixtures.policies;

// Policy structure:
{
  seeding: {
    policyName: 'USTA SEEDING',
    seedingProfile: {
      positioning: 'SEPARATE',
      drawTypes: {
        ROUND_ROBIN_WITH_PLAYOFF: { positioning: 'WATERFALL' },
        ROUND_ROBIN: { positioning: 'WATERFALL' }
      }
    },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 4,   minimumParticipantCount: 3,   seedsCount: 2 },
      { drawSize: 16,  minimumParticipantCount: 12,  seedsCount: 4 },
      { drawSize: 32,  minimumParticipantCount: 24,  seedsCount: 8 },
      { drawSize: 64,  minimumParticipantCount: 48,  seedsCount: 16 },
      { drawSize: 128, minimumParticipantCount: 96,  seedsCount: 32 },
      { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 }
    ]
  }
}
```

**Key Features:**

- SEPARATE positioning for elimination draws
- WATERFALL positioning for Round Robin draws
- Requires 96 participants for 32 seeds in 128 draw
- Supports duplicate seed numbers (tied rankings)

---

### POLICY_SEEDING_ITF

**Purpose:** International Tennis Federation standard seeding  
**Positioning:** CLUSTER (seeds may be adjacent)  
**Use Case:** ITF tournaments, international play, Davis Cup, Fed Cup

**Full Policy:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_ITF } = fixtures.policies;

// Policy structure:
{
  seeding: {
    policyName: 'ITF SEEDING',
    seedingProfile: { positioning: 'CLUSTER' },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 4,   minimumParticipantCount: 3,   seedsCount: 2 },
      { drawSize: 16,  minimumParticipantCount: 12,  seedsCount: 4 },
      { drawSize: 32,  minimumParticipantCount: 24,  seedsCount: 8 },
      { drawSize: 64,  minimumParticipantCount: 48,  seedsCount: 16 },
      { drawSize: 128, minimumParticipantCount: 97,  seedsCount: 32 },
      { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 }
    ]
  }
}
```

**Key Features:**

- CLUSTER positioning (alternating pattern)
- Only requires 97 participants for 32 seeds in 128 draw (vs USTA's 96)
- Supports duplicate seed numbers

**Difference from USTA:**

- Main difference is CLUSTER vs SEPARATE positioning
- Slightly lower threshold for 128 draw (97 vs 96)
- No draw type specific overrides

---

### POLICY_SEEDING_BYES

**Purpose:** Seeding policy that ignores seed positions for BYE placement  
**Positioning:** CLUSTER  
**Use Case:** Tournaments where BYEs should be distributed independently of seeding

**Full Policy:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_BYES } = fixtures.policies;

// Policy structure:
{
  seeding: {
    policyName: 'SEED_BYES',
    seedingProfile: { positioning: 'CLUSTER' },
    validSeedPositions: { ignore: true },
    containerByesIgnoreSeeding: true, // KEY DIFFERENCE
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 4,   minimumParticipantCount: 3,   seedsCount: 2 },
      { drawSize: 16,  minimumParticipantCount: 12,  seedsCount: 4 },
      { drawSize: 32,  minimumParticipantCount: 24,  seedsCount: 8 },
      { drawSize: 64,  minimumParticipantCount: 48,  seedsCount: 16 },
      { drawSize: 128, minimumParticipantCount: 97,  seedsCount: 32 },
      { drawSize: 256, minimumParticipantCount: 192, seedsCount: 64 }
    ]
  }
}
```

**Key Features:**

- `containerByesIgnoreSeeding: true` - BYEs placed independently
- CLUSTER positioning
- Primarily for Round Robin with Playoff structures

**Use Case:**

```javascript
import { drawDefinitionConstants, fixtures } from 'tods-competition-factory';
const { ROUND_ROBIN_WITH_PLAYOFF } = drawDefinitionConstants;
const { POLICY_SEEDING_BYES } = fixtures.policies;

tournamentEngine.generateDrawDefinition({
  drawType: ROUND_ROBIN_WITH_PLAYOFF,
  policyDefinitions: POLICY_SEEDING_BYES,
  participants: myParticipants,
  drawSize: 16,
  seedsCount: 4,
});
// BYEs will be distributed without regard to seed positions
```

---

## Composing a variant {#composing-a-variant}

`POLICY_SEEDING_NATIONAL` used to sit here. It was removed in 7.x: it was `POLICY_SEEDING_ITF` with
two keys omitted, one of which (`duplicateSeedNumbers`) does nothing when omitted, so its entire
distinguishing content was a single absent key. It was never exported, so nothing could import it.

Express that — or any federation's rules — with [`policyComposer`](../engines/policy-composer), which
is a root export:

```javascript
import { fixtures, policyComposer, policyConstants } from 'tods-competition-factory';

const { POLICY_TYPE_SEEDING } = policyConstants;
const { POLICY_SEEDING_ITF } = fixtures.policies;

// ITF rules, but a seed may not be hand-placed outside a seed block.
const positionsEnforced = policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_ITF)
  .unset('validSeedPositions')
  .set('policyName', 'ITF SEEDING, POSITIONS ENFORCED')
  .build();
```

### Seeding more deeply than the built-ins

The reason most federations need a variant is **depth** — how many seeds a draw of a given size
gets. All three built-ins stop at `drawSize / 4`:

```javascript
// 16 seeds in a 32 draw, where the built-ins allow 8.
const deepSeeding = policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_ITF)
  .set('policyName', 'DEEP SEEDING')
  .set('seedsCountThresholds', [
    { drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 },
    { drawSize: 16, minimumParticipantCount: 12, seedsCount: 8 },
    { drawSize: 32, minimumParticipantCount: 24, seedsCount: 16 },
  ])
  .build();
```

Two things to know when a draw is generated with a deeper policy:

- `seedsCountThresholds` is a **maximum**, gated on `minimumParticipantCount`. A 32 draw with 20
  entries gets the count from the highest threshold whose participant minimum is met.
- Passing an explicit `seedsCount` above the policy's maximum is clamped back down unless
  `enforcePolicyLimits: false` is also passed. `drawSize` and the stage's entry count still cap it
  either way. See [generateDrawDefinition](../governors/generation-governor).

`policyComposer` is immutable — `extend` never mutates the fixture you pass it — so one base composer
can safely seed several federation variants. `.register({ name, version })` builds and records the
result in `policyRegistry` in one step.

## Usage Examples

### Basic Usage

```javascript
import { tournamentEngine } from 'tods-competition-factory';

// Using built-in USTA policy
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_DEFAULT } = fixtures.policies;

tournamentEngine.generateDrawDefinition({
  policyDefinitions: POLICY_SEEDING_DEFAULT,
  drawSize: 32,
  seedsCount: 8,
  // ...other parameters
});
```

### Custom Seeding Policy

```javascript
import { drawDefinitionConstants, policyConstants } from 'tods-competition-factory';
const { SEPARATE } = drawDefinitionConstants;
const { POLICY_TYPE_SEEDING } = policyConstants;

const customSeedingPolicy = {
  [POLICY_TYPE_SEEDING]: {
    policyName: 'Custom Club Policy',
    seedingProfile: {
      positioning: SEPARATE,
    },
    duplicateSeedNumbers: false,
    drawSizeProgression: true,
    validSeedPositions: { ignore: false },
    seedsCountThresholds: [
      { drawSize: 8, minimumParticipantCount: 6, seedsCount: 2 },
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
    ],
  },
};

tournamentEngine.generateDrawDefinition({
  policyDefinitions: customSeedingPolicy,
  drawSize: 16,
  seedsCount: 4,
  // ...
});
```

### Mixed Draw Type Seeding

```javascript
import { drawDefinitionConstants, policyConstants } from 'tods-competition-factory';
const { ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SEPARATE, WATERFALL } = drawDefinitionConstants;
const { POLICY_TYPE_SEEDING } = policyConstants;

const mixedPolicy = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: {
      positioning: SEPARATE, // Default for elimination
      drawTypes: {
        [ROUND_ROBIN]: { positioning: WATERFALL },
        [ROUND_ROBIN_WITH_PLAYOFF]: { positioning: WATERFALL },
      },
    },
    duplicateSeedNumbers: true,
    drawSizeProgression: true,
    validSeedPositions: { ignore: true },
    seedsCountThresholds: [
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
    ],
  },
};

// Elimination draw uses SEPARATE
tournamentEngine.generateDrawDefinition({
  drawType: 'SINGLE_ELIMINATION',
  policyDefinitions: mixedPolicy,
  drawSize: 32,
});

// Round Robin uses WATERFALL
tournamentEngine.generateDrawDefinition({
  drawType: ROUND_ROBIN,
  policyDefinitions: mixedPolicy,
  drawSize: 16,
});
```

### Using ADJACENT (Synonym for CLUSTER)

```javascript
import { drawDefinitionConstants, policyConstants } from 'tods-competition-factory';
const { ADJACENT } = drawDefinitionConstants;
const { POLICY_TYPE_SEEDING } = policyConstants;

const adjacentSeeding = {
  [POLICY_TYPE_SEEDING]: {
    policyName: 'Adjacent Seeding',
    seedingProfile: {
      positioning: ADJACENT, // Same as CLUSTER
    },
    duplicateSeedNumbers: true,
    validSeedPositions: { ignore: true },
    drawSizeProgression: true,
    seedsCountThresholds: [{ drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 }],
  },
};

tournamentEngine.generateDrawDefinition({
  policyDefinitions: adjacentSeeding,
  drawSize: 32,
});
```

### Dynamic Seeds Count Based on Participants

```javascript
// Automatic seeds count determination
const participants = getMyParticipants(); // 28 participants

tournamentEngine.generateDrawDefinition({
  policyDefinitions: POLICY_SEEDING_DEFAULT,
  participants,
  // seedsCount automatically calculated:
  // 28 participants → 32 draw → meets threshold (24) → 8 seeds
});

// Override automatic calculation
tournamentEngine.generateDrawDefinition({
  policyDefinitions: POLICY_SEEDING_DEFAULT,
  participants,
  seedsCount: 4, // Manual override
});
```

### Qualification Draw Seeding

```javascript
import { drawDefinitionConstants, policyConstants } from 'tods-competition-factory';
const { CLUSTER, QUALIFYING } = drawDefinitionConstants;
const { POLICY_TYPE_SEEDING } = policyConstants;

const qualifyingSeeding = {
  [POLICY_TYPE_SEEDING]: {
    seedingProfile: {
      positioning: CLUSTER,
      nonRandom: true, // Deterministic for qualifying
    },
    validSeedPositions: { ignore: true },
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 16, minimumParticipantCount: 12, seedsCount: 4 },
      { drawSize: 32, minimumParticipantCount: 24, seedsCount: 8 },
    ],
  },
};

tournamentEngine.generateDrawDefinition({
  stage: QUALIFYING,
  policyDefinitions: qualifyingSeeding,
  drawSize: 16,
  seedsCount: 4,
});
```

### Progressive vs Conservative Seeding

```javascript
// Progressive: More seeds with fewer participants
const progressivePolicy = {
  [POLICY_TYPE_SEEDING]: {
    drawSizeProgression: true, // Key setting
    seedsCountThresholds: [
      { drawSize: 32, minimumParticipantCount: 20, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 40, seedsCount: 16 },
    ],
  },
};

// Conservative: Require more participants for seeds
const conservativePolicy = {
  [POLICY_TYPE_SEEDING]: {
    drawSizeProgression: false,
    seedsCountThresholds: [
      { drawSize: 32, minimumParticipantCount: 28, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 56, seedsCount: 16 },
    ],
  },
};

// 25 participants:
// Progressive: 32 draw, 8 seeds (25 >= 20)
// Conservative: 32 draw, likely fewer seeds
```

---

## Real-World Scenarios

### Scenario 1: USTA Junior Tournament

```javascript
import { tournamentEngine } from 'tods-competition-factory';
import { fixtures } from 'tods-competition-factory';
const { POLICY_SEEDING_DEFAULT } = fixtures.policies;

// Setup
const players = [
  // 28 players with various rankings
  { participantId: '1', seedValue: 1 }, // Top seed
  { participantId: '2', seedValue: 2 }, // Second seed
  { participantId: '3', seedValue: 3 }, // Tied at rank 3
  { participantId: '4', seedValue: 3 }, // Tied at rank 3
  { participantId: '5', seedValue: 5 },
  { participantId: '6', seedValue: 6 },
  { participantId: '7', seedValue: 7 },
  { participantId: '8', seedValue: 8 },
  // ... 20 more unseeded players
];

// Create tournament
tournamentEngine.newTournamentRecord({
  tournamentName: 'USTA Junior Championships',
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Boys 18 Singles',
}).eventId;

tournamentEngine.addEventEntries({
  eventId,
  participantIds: players.map((p) => p.participantId),
});

// Generate draw with USTA seeding
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  policyDefinitions: POLICY_SEEDING_DEFAULT,
  participants: players,
  drawSize: 32,
  // seedsCount automatically: 28 participants, 32 draw, 28 >= 24 → 8 seeds
});

// Result:
// - 32 draw size (next power of 2 from 28)
// - 8 seeds (threshold met)
// - 4 BYEs (32 - 28)
// - SEPARATE positioning (USTA style)
// - Two players with seedValue 3 both placed in seed block 3-4
```

---

### Scenario 2: ITF World Tour Event

```javascript
import { drawDefinitionConstants, fixtures } from 'tods-competition-factory';
const { SINGLE_ELIMINATION } = drawDefinitionConstants;
const { POLICY_SEEDING_ITF } = fixtures.policies;

// 98 players for main draw
const mainDrawPlayers = [...]; // 98 players

// 48 players for qualifying
const qualifyingPlayers = [...]; // 48 players

// Main Draw
tournamentEngine.newTournamentRecord({
  tournamentName: 'ITF World Tennis Tour M25'
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Men Singles'
}).eventId;

// Generate qualifying draw
const { drawId: qualifyingDrawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  stage: 'QUALIFYING',
  policyDefinitions: POLICY_SEEDING_ITF,
  participants: qualifyingPlayers,
  drawSize: 64,
  seedsCount: 16 // 48 participants >= 48 threshold
});

// Generate main draw
const { drawId: mainDrawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  stage: 'MAIN',
  policyDefinitions: POLICY_SEEDING_ITF,
  participants: mainDrawPlayers,
  drawSize: 128,
  seedsCount: 32 // 98 participants >= 97 threshold (ITF lower than USTA)
});

// Result:
// - Qualifying: 64 draw, 16 seeds, CLUSTER positioning
// - Main: 128 draw, 32 seeds, CLUSTER positioning
// - ITF threshold (97) allows 32 seeds with 98 players
// - USTA threshold (96) would also allow 32 seeds but philosophy differs
```

---

### Scenario 3: Club Round Robin with Playoff

```javascript
import { drawDefinitionConstants, fixtures } from 'tods-competition-factory';
const { ROUND_ROBIN_WITH_PLAYOFF } = drawDefinitionConstants;
const { POLICY_SEEDING_BYES } = fixtures.policies;

// 14 players for club tournament
const clubPlayers = [
  { participantId: '1', seedValue: 1 },
  { participantId: '2', seedValue: 2 },
  { participantId: '3', seedValue: 3 },
  { participantId: '4', seedValue: 4 },
  // ... 10 more players
];

tournamentEngine.newTournamentRecord({
  tournamentName: 'Club Championships',
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Club Singles',
}).eventId;

// Generate Round Robin with Playoff
const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  drawType: ROUND_ROBIN_WITH_PLAYOFF,
  policyDefinitions: POLICY_SEEDING_BYES, // Use BYES policy
  participants: clubPlayers,
  drawSize: 16,
  seedsCount: 4,
});

// Result:
// - 4 groups of 4 players (Round Robin)
// - Top 2 from each group advance to playoff (SINGLE_ELIMINATION)
// - WATERFALL seeding in groups (Seed 1 Group A, Seed 2 Group B, etc.)
// - containerByesIgnoreSeeding: true means BYEs distributed evenly
// - 2 BYEs distributed across groups independently of seeds
```

---

### Scenario 4: Professional Tournament with Custom Thresholds

```javascript
import { drawDefinitionConstants, policyConstants } from 'tods-competition-factory';
const { SEPARATE } = drawDefinitionConstants;
const { POLICY_TYPE_SEEDING } = policyConstants;

// ATP 250 style tournament
const proTournamentPolicy = {
  [POLICY_TYPE_SEEDING]: {
    policyName: 'ATP 250 Style',
    seedingProfile: {
      positioning: SEPARATE
    },
    validSeedPositions: { ignore: true },
    duplicateSeedNumbers: false, // Professional - no ties
    drawSizeProgression: true,
    seedsCountThresholds: [
      { drawSize: 32, minimumParticipantCount: 28, seedsCount: 8 },
      { drawSize: 64, minimumParticipantCount: 56, seedsCount: 16 }
    ]
  }
};

// 32 player field
const proPlayers = [...]; // 32 ranked players

tournamentEngine.newTournamentRecord({
  tournamentName: 'ATP 250 Event'
});

const eventId = tournamentEngine.addEvent({
  eventName: 'Men Singles'
}).eventId;

const { drawId } = tournamentEngine.generateDrawDefinition({
  eventId,
  policyDefinitions: proTournamentPolicy,
  participants: proPlayers,
  drawSize: 32,
  seedsCount: 8
});

// Result:
// - 32 draw, 8 seeds
// - SEPARATE positioning (USTA style)
// - No BYEs (32 participants)
// - Unique seed numbers (duplicateSeedNumbers: false)
// - High threshold (28) ensures quality field needed for 8 seeds
```

---

## Notes

### Seed Position Calculations

Seed positions are calculated using seed blocks. The algorithm:

1. **First seed block:** `[1]` - Seed 1 always at position 1
2. **Second seed block:** `[drawSize]` - Seed 2 always at final position
3. **Third seed block:** Two positions (seeds 3-4)
4. **Fourth seed block:** Four positions (seeds 5-8)
5. **Pattern continues:** Each block doubles in size

**SEPARATE positioning:** Seeds at extremes of blocks  
**CLUSTER/ADJACENT positioning:** Seeds alternate within blocks  
**WATERFALL positioning:** Sequential distribution (Round Robin)

---

### Seeds Count Determination

The engine determines seeds count automatically:

1. Calculate draw size: `nextPowerOf2(participantCount)`
2. If `drawSizeProgression: true`, use draw size; else use participant count
3. Find matching threshold in `seedsCountThresholds` array
4. Check if participant/draw count meets `minimumParticipantCount`
5. If yes: use `seedsCount` from threshold
6. If no: check next lower threshold
7. Repeat until threshold met or minimum reached (typically 2 seeds)

---

### BYE Placement with Seeds

BYEs are placed differently based on policy:

**Standard (containerByesIgnoreSeeding: false):**

- BYEs avoid seed positions
- BYEs placed to protect seeds
- Unseeded positions preferred for BYEs

**BYES Policy (containerByesIgnoreSeeding: true):**

- BYEs distributed independently
- Container structures only (Round Robin with Playoff)
- Even distribution across groups

---

### Draw Type Overrides

When `seedingProfile.drawTypes` is defined:

1. Engine checks draw type being generated
2. Looks for matching key in `drawTypes` object
3. If found: uses override positioning
4. If not found: uses default `seedingProfile.positioning`

**Common overrides:**

- Round Robin: WATERFALL
- Elimination: SEPARATE or CLUSTER
- Feed-In: CLUSTER

---

### Duplicate Seeds Behavior

When `duplicateSeedNumbers: true`:

```javascript
// Input:
const participants = [
  { seedValue: 1 }, // Seed 1
  { seedValue: 2 }, // Seed 2
  { seedValue: 3 }, // All three tied at seed 3
  { seedValue: 3 },
  { seedValue: 3 },
  { seedValue: 6 }, // Seed 6
];

// Behavior:
// - Seed block 1: [position 1] → Seed 1 placed
// - Seed block 2: [position 32] → Seed 2 placed
// - Seed block 3-4: [positions 9, 24] → Two players with seed 3 randomly assigned
// - Seed block 5-6-7-8: Includes third player with seed 3, plus seed 6
```

Engine randomly distributes duplicate seeds within their appropriate blocks.

---

### Performance Considerations

**Large Draws:**

- 256+ draws with 64 seeds: complex calculations
- Recommendation: Use `nonRandom: false` (default) for faster generation

**Many Participants:**

- 200+ participants: threshold checking is O(n)
- Sorted thresholds allow early exit

**Draw Generation Time:**

- SEPARATE: Fastest (straightforward algorithm)
- CLUSTER/ADJACENT: Slightly slower (alternating logic)
- WATERFALL: Moderate (sequential assignment)

---

### Validation Rules

The engine validates:

1. **seedsCountThresholds:**
   - Must have at least one entry
   - drawSize must be power of 2
   - minimumParticipantCount must be ≤ drawSize

2. **positioning:**
   - Must be valid value: CLUSTER, ADJACENT, SEPARATE, or WATERFALL

3. **seedsCount:**
   - Cannot exceed drawSize / 2
   - Must be ≥ 2 (minimum seeding)

4. **validSeedPositions:**
   - When `ignore: false`, enforces standard seed blocks
   - When `ignore: true`, allows manual placement

---

### Integration with Other Policies

Seeding policy works with:

- **Avoidance Policy:** Seeds from same country/club separated
- **Progression Policy:** Seeded players' advancement rules
- **Scoring Policy:** No direct interaction
- **Position Actions Policy:** Seeds restrict position modifications
- **MatchUp Actions Policy:** Seeds affect matchUp constraints

Example:

```javascript
import { fixtures, policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_AVOIDANCE } = policyConstants;
const { POLICY_SEEDING_ITF } = fixtures.policies;

const combinedPolicies = {
  ...POLICY_SEEDING_ITF,
  [POLICY_TYPE_AVOIDANCE]: {
    // Avoidance rules
  },
};

tournamentEngine.generateDrawDefinition({
  policyDefinitions: combinedPolicies,
  // ...
});
```

---

## Related Methods

### Query Methods

:::warning Not part of the public surface
`getSeedBlocks`, `getValidSeedBlocks` and `isValidSeedPosition` are **internal**. They are reachable
by module path inside this repository but are exported neither as root names nor through any
governor, so a package consumer cannot call them. They are described here because they explain how
seed blocks are derived — not as an API. If you need one of them from a consumer, that is a request
to export it, not a bug in your import.
:::

#### `getSeedBlocks()` (internal)

Derives seed blocks for a participant count.

```javascript
// Shape only — not importable from the package.
const { seedBlocks } = getSeedBlocks({
  participantsCount: 32,
  cluster: true, // CLUSTER/ADJACENT positioning
});

// Returns: [[1], [32], [16, 17], [8, 9, 24, 25], ...]
```

#### `getValidSeedBlocks()` (internal)

Seed blocks for a specific structure with the policy applied.

```javascript
// Shape only — not importable from the package.
const { validSeedBlocks } = getValidSeedBlocks({
  structure,
  drawDefinition,
  appliedPolicies: POLICY_SEEDING_ITF,
});
```

#### `getStructureSeedAssignments()`

Retrieves current seed assignments in a structure.

```javascript
tournamentEngine.getStructureSeedAssignments({
  drawId,
  structureId,
});
```

---

### Mutation Methods

#### `assignSeed()`

Assigns a seed to a specific participant.

```javascript
tournamentEngine.assignSeed({
  drawId,
  participantId: 'player-123',
  seedNumber: 1,
  seedValue: 1,
});
```

#### `clearDrawSeeding()`

Removes all seed assignments from a draw.

```javascript
tournamentEngine.clearDrawSeeding({ drawId });
```

#### `generateDrawDefinition()`

Primary method for draw generation with seeding policy.

```javascript
tournamentEngine.generateDrawDefinition({
  drawSize: 32,
  seedsCount: 8,
  policyDefinitions: POLICY_SEEDING_ITF,
  // ...
});
```

---

## Seed Assignments

Every draw structure uses `seedAssignments` to associate unique `participantIds` with unique `seedNumbers`.

### Structure

```typescript
type SeedAssignment = {
  seedNumber: number; // Unique seed number (1, 2, 3, ...)
  seedValue: string; // Display value (can be same for multiple seeds)
  participantId: string; // Unique participant identifier
};

// Example:
const seedAssignments = [
  {
    seedNumber: 1,
    seedValue: '1',
    participantId: '772C5CA9-C092-418C-AC6F-A6B584BD2D37',
  },
  {
    seedNumber: 2,
    seedValue: '2',
    participantId: '267BAA81-5A38-4AAF-9EA3-E434A1ED63AD',
  },
  {
    seedNumber: 3,
    seedValue: '3-4', // Can have custom display value
    participantId: 'ABC123...',
  },
  {
    seedNumber: 4,
    seedValue: '3-4', // Same display value as seed 3
    participantId: 'DEF456...',
  },
];
```

### Key Points

**Unique Seed Numbers:**

- Only one `participantId` may be assigned to each `seedNumber`
- Seed numbers are always unique within a draw structure
- Seed numbers determine seed block placement

**Custom Seed Values:**

- Each seed assignment may have a custom `seedValue` for display
- Multiple seeds can share the same `seedValue` (e.g., "5-8" for seeds 5, 6, 7, 8)
- Useful for showing seed ranges on printed draws

**Examples:**

```javascript
// Standard seeding (unique values)
const standardSeeds = [
  { seedNumber: 1, seedValue: '1', participantId: 'p1' },
  { seedNumber: 2, seedValue: '2', participantId: 'p2' },
  { seedNumber: 3, seedValue: '3', participantId: 'p3' },
  { seedNumber: 4, seedValue: '4', participantId: 'p4' },
];

// Grouped seeding (same display value)
const groupedSeeds = [
  { seedNumber: 5, seedValue: '5-8', participantId: 'p5' },
  { seedNumber: 6, seedValue: '5-8', participantId: 'p6' },
  { seedNumber: 7, seedValue: '5-8', participantId: 'p7' },
  { seedNumber: 8, seedValue: '5-8', participantId: 'p8' },
];

// Duplicate seed numbers scenario (when duplicateSeedNumbers: true)
// Five participants with equivalent rankings all appear as seed "4"
const duplicateSeeds = [
  { seedNumber: 1, seedValue: '1', participantId: 'p1' },
  { seedNumber: 2, seedValue: '2', participantId: 'p2' },
  { seedNumber: 3, seedValue: '3', participantId: 'p3' },
  { seedNumber: 4, seedValue: '4', participantId: 'p4' }, // From 3-4 block
  { seedNumber: 5, seedValue: '4', participantId: 'p5' }, // From 5-8 block
  { seedNumber: 6, seedValue: '4', participantId: 'p6' }, // From 5-8 block
  { seedNumber: 7, seedValue: '4', participantId: 'p7' }, // From 5-8 block
  { seedNumber: 8, seedValue: '4', participantId: 'p8' }, // From 5-8 block
];
```

### Retrieving Seed Assignments

```javascript
// Get seed assignments for a structure
tournamentEngine.getStructureSeedAssignments({
  drawId,
  structureId,
});

// Returns:
// {
//   seedAssignments: [
//     { seedNumber: 1, seedValue: "1", participantId: "..." },
//     { seedNumber: 2, seedValue: "2", participantId: "..." },
//     // ...
//   ]
// }

// Get participant with seeding information
tournamentEngine.getParticipants({
  withSeeding: true,
  withEvents: true,
});

// Returns participants with events[].seedValue populated
```

### Important Notes

**Seed Block Placement:**

- Seed number determines which seed block the participant is placed in
- Seed value is for display only - does not affect placement
- Even with same seed value, seed numbers must be unique

**Display Scenarios:**

- Some providers display seeds 5-8 all with value "5-8"
- Some providers display all tied participants with same seed number on draw
- ITF often shows "3/4" for seeds in the 3-4 block
- USTA typically shows individual seed numbers

**With `duplicateSeedNumbers: true`:**

- Engine allows multiple participants to share the same `seedValue`
- Useful when player rankings are tied
- All participants in a seed block can show same display value
- Internal seed numbers still unique for placement

---

## Related Concepts

- **Seed Blocks** - How seed positions are calculated using block patterns
- **Draw Types** - Different draw structures (SINGLE_ELIMINATION, ROUND_ROBIN, etc.)
- **Position Assignment** - How participants are placed in draw positions
- **Avoidance Policy** - Keeping seeds from same country/club apart
- **BYE Positioning** - How BYEs are placed to protect seeds

---

## Summary

The **Seeding Policy** is one of the most critical tournament policies, controlling:

1. **Seed positioning patterns** (SEPARATE, CLUSTER/ADJACENT, WATERFALL)
2. **Seeds count** based on draw size and participant count
3. **Draw type specific overrides** (different positioning per draw type)
4. **Duplicate seeds** for tied rankings
5. **BYE placement** interaction with seeds
6. **Flexible vs strict** seed position validation

**Four built-in policies provided:**

- **POLICY_SEEDING_DEFAULT** - USTA style (SEPARATE positioning)
- **POLICY_SEEDING_ITF** - ITF style (CLUSTER positioning)
- **POLICY_SEEDING_BYES** - BYE placement ignores seeding

The policy ensures fair competitive balance by strategically placing top players throughout the draw, preventing early meetings between the strongest competitors.

**Key recommendation:** Use built-in policies when possible (USTA or ITF), customize only when specific tournament rules require it.
