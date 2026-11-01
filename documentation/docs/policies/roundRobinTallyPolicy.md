# Round Robin Tally Policy

The **Round Robin Tally Policy** controls how participants are ranked within round robin groups, including tiebreaking procedures, head-to-head calculations, and group order determination.

---

## Overview

Round robin groups require sophisticated tiebreaking rules to determine final standings when participants have equal records. The tally policy provides:

- **Flexible tiebreaking** through configurable `tallyDirectives`
- **Head-to-head** comparisons between tied participants
- **Percentage calculations** (matches, sets, games, points)
- **Statistical tracking** (wins, losses, defaults, retirements)
- **Threshold-based rules** via [maxParticipants](./maxParticipants.md) attribute
- **Composite scoring** through GEMscore
- **Group totals** for percentage calculations

---

## Default Behavior

When no custom tally policy is specified, the system applies a comprehensive default tiebreaking procedure that follows widely-accepted tournament standards.

### Standard Tiebreaking Sequence

The **default tally policy** implements the following hierarchy:

1. **Primary criterion:** Participants grouped by `matchUpsWon`
2. **Head-to-head comparison:** When participants are tied, their direct results against each other are evaluated
3. **Percentage-based tiebreakers:** Match, set, game, and point percentages (in order)
4. **Scope escalation:** First evaluate all group matches, then recalculate among tied participants only

### Algorithm Overview

The tiebreaking algorithm works as follows:

1. **Group participants** by the primary attribute (default: `matchUpsWon`)
2. **For each tied group:**
   - If only 1 participant: resolved (no tie)
   - If exactly 2 participants: compare head-to-head record
   - If 3+ participants: apply `tallyDirectives` sequence
3. **Apply directives** until ties are broken or all directives exhausted
4. **Recursive separation:** As each directive separates participants, smaller groups are formed and process repeats

### Head-to-Head Logic

**When 2 participants are tied:**

- Their win-loss record across every meeting
- More wins over the other places higher
- If the record is level, or they didn't play: move to next directive

**When 3+ participants are tied:**

- Calculate statistics among only the tied participants
- Look for clear separation
- If circular tie (A>B>C>A): move to next directive

**Head-to-head is applied BEFORE tallyDirectives** unless explicitly disabled via `headToHead: { disabled: true }`.

Head-to-head reads the **record** between the two participants across every meeting: the one with more wins over the
other is placed first. A level record (1-1 in a double round robin) or no meeting does not separate them, and the
`tallyDirectives` decide. The order in which meetings are listed never matters. (Before the standings engine, any one
victory decided, so a pair that split two meetings was decided by whichever meeting was found first.)

A directive's `disableHeadToHead` (skip head-to-head when sorting the sets that directive splits off) takes effect only
when the policy also declares a `headToHead` object.

---

## Implementation Details

### Calculated Attributes

For each participant, the following attributes are calculated from match results:

**Match-level:**

- `matchUpsWon` - Total matches won
- `matchUpsLost` - Total matches lost
- `matchUpsCancelled` - Matches that were cancelled/abandoned
- `matchUpsPct` - Win percentage: `matchUpsWon / (matchUpsWon + matchUpsLost)`

**Set-level:**

- `setsWon` - Total sets won
- `setsLost` - Total sets lost
- `setsPct` - Win percentage: `setsWon / (setsWon + setsLost)`

**Game-level:**

- `gamesWon` - Total games won
- `gamesLost` - Total games lost
- `gamesPct` - Win percentage: `gamesWon / (gamesWon + gamesLost)`

**Point-level:**

- `pointsWon` - Total points won
- `pointsLost` - Total points lost
- `pointsPct` - Win percentage: `pointsWon / (pointsWon + pointsLost)`

**Incomplete matches:**

- `defaults` - Number of times participant defaulted
- `walkovers` - Number of times participant walked over
- `retirements` - Number of times participant retired
- `allDefaults` - Total of all exit statuses (defaults + walkovers + retirements)

**TEAM events (tieMatchUps):**

- `tieMatchUpsWon` - Individual matches won
- `tieMatchUpsLost` - Individual matches lost
- `tieSinglesWon` - Singles matches won
- `tieSinglesLost` - Singles matches lost
- `tieDoublesWon` - Doubles matches won
- `tieDoublesLost` - Doubles matches lost

**Final result:**

- `groupOrder` - Final placement (1-based, lower is better)
- `GEMscore` - Composite score (if configured)

### Calculation Scoping

**Global scope (idsFilter: false):**

```javascript
// Calculate from ALL group matches
matchUpsPct = matchUpsWon / (matchUpsWon + matchUpsLost);
```

**Filtered scope (idsFilter: true):**

```javascript
// Calculate from ONLY matches among tied participants
// Example: If A, B, C are tied, only count A-B, A-C, B-C matches
matchUpsPct = matchUpsWon_amongTied / (matchUpsWon_amongTied + matchUpsLost_amongTied);
```

### Group Totals

**Participant-based (groupTotals: false - default):**

```javascript
gamesPct = gamesWon / (gamesWon + gamesLost);
// Each participant's denominator is their own games
// Sum of all gamesPct can exceed 1.0
```

**Group-based (groupTotals: true):**

```javascript
totalGroupGames = sum of all gamesWon by all participants
gamesPct = gamesWon / totalGroupGames
// Sum of all gamesPct = 1.0
```

### Directive Processing

Directives are applied sequentially:

```javascript
for (const directive of tallyDirectives) {
  // 1. Check maxParticipants threshold
  if (directive.maxParticipants && tiedCount > directive.maxParticipants) {
    continue; // Skip this directive
  }

  // 2. Calculate attribute (with idsFilter if specified)
  const values = calculateAttribute(directive, tiedParticipants);

  // 3. Sort (reversed if specified)
  const sorted = directive.reversed
    ? sortAscending(values) // Least to greatest
    : sortDescending(values); // Greatest to least

  // 4. Separate into groups by value
  const groups = groupByValue(sorted);

  // 5. Recursively process each group
  groups.forEach((group) => {
    if (group.length > 1) {
      // Still tied, continue with next directive
    } else {
      // Resolved! Assign groupOrder
    }
  });
}
```

### Precision in Percentages

Percentages are calculated with configurable precision:

```javascript
const precision = Math.pow(10, tallyPolicy?.precision || 3);
// precision: 3 → 1000 → 0.667
// precision: 5 → 100000 → 0.66667

matchUpsPct = Math.round((matchUpsWon / matchUpsTotal) * precision) / precision;
```

---

## Policy Structure

```typescript
type RoundRobinTallyPolicy = {
  policyName?: string;

  // Initial grouping attribute
  groupOrderKey?:
    | 'matchUpsWon'
    | 'tieMatchUpsWon'
    | 'tieSinglesWon'
    | 'tieDoublesWon'
    | 'pointsWon'
    | 'gamesWon'
    | 'setsWon'
    | 'gamesPct'
    | 'setsPct'
    | 'pointsPct'
    | 'matchUpsPct';

  // Tiebreaking sequence
  tallyDirectives?: Array<{
    attribute: string; // Which statistic to compare
    idsFilter?: boolean; // Compare only tied participants
    reversed?: boolean; // Least-to-greatest instead of greatest-to-least
    maxParticipants?: number; // Only apply if # tied <= threshold
    groupTotals?: boolean; // Use group totals for percentages
    disableHeadToHead?: boolean; // Skip head-to-head for this directive
  }>;

  // Head-to-head configuration
  headToHead?: {
    disabled?: boolean; // Skip head-to-head entirely
  };

  // Percentage calculation options
  groupTotalGamesPlayed?: boolean; // Use all group games for gamesPct
  groupTotalSetsPlayed?: boolean; // Use all group sets for setsPct
  precision?: number; // Decimal precision (default: 3)

  // Disqualification rules
  disqualifyDefaults?: boolean; // Push defaulting participants to bottom
  disqualifyWalkovers?: boolean; // Push walkover participants to bottom

  // Exclude specific match statuses
  excludeMatchUpStatuses?: string[]; // e.g., ['ABANDONED', 'INCOMPLETE']

  // Credit for incomplete matches
  setsCreditForDefaults?: boolean;
  setsCreditForWalkovers?: boolean;
  setsCreditForRetirements?: boolean;
  gamesCreditForDefaults?: boolean;
  gamesCreditForWalkovers?: boolean;
  gamesCreditForRetirements?: boolean;
  gamesCreditForTiebreakSets?: boolean; // Default: true

  // Composite score attributes
  GEMscore?: string[]; // Attributes to include in GEMscore calculation
};
```

---

## Built-in Policies

### Default Tally Policy

**Standard tiebreaking procedure:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_ROUND_ROBIN_TALLY_DEFAULT } = fixtures.policies;

const policy = POLICY_ROUND_ROBIN_TALLY_DEFAULT[POLICY_TYPE_ROUND_ROBIN_TALLY];
// {
//   policyName: 'Default Round Robin Tally',
//   groupOrderKey: 'matchUpsWon',
//   tallyDirectives: [
//     { attribute: 'matchUpsPct', idsFilter: false },
//     { attribute: 'allDefaults', reversed: true, idsFilter: false },
//     { attribute: 'defaults', reversed: true, idsFilter: false },
//     { attribute: 'walkovers', reversed: true, idsFilter: false },
//     { attribute: 'retirements', reversed: true, idsFilter: false },
//     { attribute: 'setsPct', idsFilter: false },
//     { attribute: 'gamesPct', idsFilter: false },
//     { attribute: 'pointsPct', idsFilter: false },
//     { attribute: 'matchUpsPct', idsFilter: true },
//     { attribute: 'setsPct', idsFilter: true },
//     { attribute: 'gamesPct', idsFilter: true },
//     { attribute: 'pointsPct', idsFilter: true },
//   ],
// }
```

**Tiebreaking sequence:**

1. Match win percentage (all group matches)
2. Fewest all defaults (any exit status)
3. Fewest defaults
4. Fewest walkovers
5. Fewest retirements
6. Set win percentage (all group matches)
7. Game win percentage (all group matches)
8. Point win percentage (all group matches)
9. Match win percentage (among tied teams only)
10. Set win percentage (among tied teams only)
11. Game win percentage (among tied teams only)
12. Point win percentage (among tied teams only)

---

### JTT Tally Policy

**Junior Team Tennis format:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_ROUND_ROBIN_TALLY_JTT } = fixtures.policies;

// {
//   policyName: 'JTT Round Robin Tally',
//   groupOrderKey: 'gamesWon',
//   tallyDirectives: [
//     { attribute: 'matchUpsPct', idsFilter: true },
//     { attribute: 'gamesWon', idsFilter: false },
//     { attribute: 'matchUpsWon', idsFilter: false },
//     { attribute: 'tieMatchUpsWon', idsFilter: false },
//     { attribute: 'setsWon', idsFilter: false },
//   ],
// }
```

**Key features:**

- **Primary criterion:** Most games won
- **Head-to-head first:** matchUpsPct with idsFilter: true
- **Designed for team tennis** where games won is primary metric

---

### TOC Tally Policy

**Tournament of Champions format:**

```javascript
import { fixtures } from 'tods-competition-factory';
const { POLICY_ROUND_ROBIN_TALLY_TOC } = fixtures.policies;

// {
//   policyName: 'TOC Round Robin Tally',
//   groupOrderKey: 'matchUpsPct',
//   tallyDirectives: [
//     { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
//     { attribute: 'gamesPct', idsFilter: false },
//     { attribute: 'gamesWon', idsFilter: false },
//     { attribute: 'gamesLost', idsFilter: false, reversed: true },
//   ],
// }
```

**Key features:**

- **maxParticipants: 2** on head-to-head (only if 2 teams tied)
- **Games percentage** for 3+ team ties
- **Fewest games lost** as final tiebreaker

---

## Key Attributes

### groupOrderKey

**Purpose:** Initial attribute to group participants by before applying tiebreakers.

**Valid values:**

- `'matchUpsWon'` (default)
- `'tieMatchUpsWon'` (for TEAM events)
- `'tieSinglesWon'` (for TEAM events)
- `'tieDoublesWon'` (for TEAM events)
- `'pointsWon'`
- `'gamesWon'`
- `'setsWon'`
- `'gamesPct'`
- `'setsPct'`
- `'pointsPct'`
- `'matchUpsPct'`

**Example:**

```javascript
const policy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    groupOrderKey: 'gamesWon', // Group by total games won
    tallyDirectives: [{ attribute: 'gamesPct', idsFilter: false }],
  },
};
```

---

### tallyDirectives

**Purpose:** Sequence of tiebreaking rules applied in order.

**Structure:**

```javascript
{
  attribute: string;        // Statistic to compare
  idsFilter?: boolean;      // Scope to tied participants only
  reversed?: boolean;       // Reverse sort order (least-to-greatest)
  maxParticipants?: number; // Threshold-based application
  groupTotals?: boolean;    // Use group totals for percentages
}
```

**Directive attributes:**

- `matchUpsPct` - Match win percentage
- `setsPct` - Set win percentage
- `gamesPct` - Game win percentage
- `pointsPct` - Point win percentage
- `matchUpsWon` - Total matches won
- `setsWon` - Total sets won
- `gamesWon` - Total games won
- `pointsWon` - Total points won
- `matchUpsLost` - Total matches lost
- `setsLost` - Total sets lost
- `gamesLost` - Total games lost
- `pointsLost` - Total points lost
- `defaults` - Number of defaults
- `walkovers` - Number of walkovers
- `retirements` - Number of retirements
- `allDefaults` - All exit statuses combined
- `tieMatchUpsWon` - Individual matches won (TEAM events)
- `tieSinglesWon` - Singles matches won (TEAM events)
- `tieDoublesWon` - Doubles matches won (TEAM events)

**See also:** [maxParticipants documentation](./maxParticipants.md) for threshold-based tiebreaking

---

### idsFilter

**Purpose:** Scope calculations to only the tied participants.

**When false (default):**

- Statistics calculated from ALL group matches
- Example: gamesPct = gamesWon / (gamesWon + gamesLost) across entire group

**When true:**

- Statistics calculated ONLY from matches among tied participants
- Example: If A, B, C are tied, only count A-B, A-C, B-C matches
- Used for head-to-head comparisons

**Example:**

```javascript
tallyDirectives: [
  // Stage 1: Overall group performance
  { attribute: 'gamesPct', idsFilter: false },

  // Stage 2: Performance among tied teams only
  { attribute: 'gamesPct', idsFilter: true },
];
```

---

### reversed

**Purpose:** Reverse sort order from greatest-to-least to least-to-greatest.

**Use cases:**

- Fewest losses
- Fewest defaults/walkovers/retirements
- Fewest penalty minutes
- Any "lower is better" metric

**Example:**

```javascript
tallyDirectives: [
  { attribute: 'gamesWon', reversed: false }, // Most games won
  { attribute: 'gamesLost', reversed: true }, // Fewest games lost
];
```

---

### maxParticipants

**Purpose:** Only apply directive when number of tied participants does not exceed threshold.

**Common usage:**

```javascript
{
  attribute: 'matchUpsPct',
  idsFilter: true,
  maxParticipants: 2  // Only if exactly 2 teams tied
}
```

**Why this exists:**

- **2 teams:** Direct head-to-head works (one beat the other)
- **3+ teams:** Circular ties possible (A>B>C>A)
- Sports rules universally distinguish 2-team vs 3+-team ties

**See:** [maxParticipants documentation](./maxParticipants.md) for complete details and sports precedents

---

### groupTotals

**Purpose:** Use total group games/sets for percentage calculations instead of participant totals.

**When false (default):**

```text
gamesPct = gamesWon / (gamesWon + gamesLost)
// Sum of all gamesPct can be > 1.0
```

**When true:**

```text
gamesPct = gamesWon / (total games played by all participants)
// Sum of all gamesPct = 1.0
```

**Example:**

```javascript
tallyDirectives: [
  {
    attribute: 'gamesPct',
    idsFilter: false,
    groupTotals: true, // Use total group games as denominator
  },
];
```

**Or set at top level:**

```javascript
{
  groupTotalGamesPlayed: true,  // All gamesPct calculations
  groupTotalSetsPlayed: true,   // All setsPct calculations
}
```

---

### headToHead

**Purpose:** Configure head-to-head tiebreaking behavior.

**Default behavior:**

- When 2 participants tied: Compare their head-to-head record
- When 3+ participants tied: Try to separate with head-to-head among all tied

**Disable completely:**

```javascript
{
  headToHead: { disabled: true },
  tallyDirectives: [
    // Head-to-head skipped, go straight to directives
    { attribute: 'gamesPct', idsFilter: false },
  ],
}
```

**Note:** Head-to-head happens BEFORE tallyDirectives. Disabling it forces all tiebreaking through directives.

---

## Splits, gates and the final step

These fields are read by the standings engine, which orders round-robin groups and season tables alike.

### onSplit

What happens when a directive splits a tied set.

- `'RESTART'` (default): every part goes back to the first directive. A pair split off by `setsPct` is settled by
  head-to-head next. FIBA, NBA, IIHF and FIDE work this way.
- `'CONTINUE'`: every part continues with the next directive. A mini-league directive (`idsFilter: true`) is first
  re-applied to the residue it leaves, so a pair it splits off is settled by their own meeting before any overall
  measure is read.
- `'EXTRACT_ONE'`: one participant is resolved per step, the leader of the top part, and everyone else (including the
  rest of the top part) goes back to the first directive. This is the NFL's procedure.

### minParticipants

The directive is passed over when fewer than this many participants are tied, as `maxParticipants` passes it over
when more are. For example, aggregate measures for a three-way tie, head-to-head for two.

### when

`{ purposes?: string[]; phase?: 'PROVISIONAL' | 'FINAL' }` on a directive. `purposes` limits it to tables computed
for those purposes: `getSeasonStandings({ purpose })`, with `STANDINGS_PURPOSE_MOVEMENT` passed by
`getSeasonMovement` and `STANDINGS_PURPOSE_ADVANCEMENT` by `getSeasonAdvancement`. `phase: 'FINAL'` skips the
directive while results are outstanding (a provisional order). A directive skipped by `when` is not reported.

### terminal

What happens to a set no directive splits.

- `'ADJUDICATE'` (default): the set shares a place, and an organiser's sub-order (`setSubOrder`) may order it.
- `'SHARE'`: the place is shared and stays shared, whatever a sub-order says.
- `'LOT'`: a draw seeded by the structure (a group) or the season and tier (a season table). The same seed always
  draws the same order, and the report records the seed.

```js
{
  onSplit: 'CONTINUE',
  terminal: 'LOT',
  tallyDirectives: [
    { attribute: 'matchUpsPct', idsFilter: true },
    { attribute: 'gamesPct', minParticipants: 3 },
    { attribute: 'gamesWon', when: { purposes: ['MOVEMENT'], phase: 'FINAL' } },
  ],
}
```

---

## Percentage Calculations

### precision

**Purpose:** Control decimal precision for percentage calculations.

**Default:** 3 (1000)

**Example:**

```javascript
{
  precision: 5,  // Results: 0.66667 instead of 0.667
}
```

**Formula:** `Math.pow(10, precision)`

- precision: 3 → 1000 → 0.667
- precision: 5 → 100000 → 0.66667
- precision: 7 → 10000000 → 0.6666667

---

### precision: 'EXACT'

`precision: 'EXACT'` compares and stores percentages unrounded, so two percentages tie only when their fractions are
equal. With a number (default 3), values equal after rounding to that many decimal places tie. Many rulebooks state
this explicitly ("win percentage to three decimal places"), so it is a ranking rule, not only a display setting.

### Zero denominators

A percentage with nothing played is 0. For example, `setsPct` for a participant whose only result is a walkover. A
ratio with nothing lost is unbounded: it ranks first when anything was won, and is 0 when nothing was won either. A
directive can change that with `zeroDivision` (below).

### Differences and ratios

`setsDiff`, `gamesDiff` and `pointsDiff` (won minus lost) are stored with the other measures. `setsRatio`,
`gamesRatio` and `pointsRatio` (won over lost) are computed only when ordering, never stored, because a ratio with
nothing lost is unbounded and a stored tally must stay serialisable. Any of them may be the `groupOrderKey` or a
directive `attribute`.

A ratio directive's `zeroDivision` decides what an unbeaten ratio means for that directive:

- `'MAX'` (default): it ranks first (FIVB's convention).
- `'ZERO'`: it reads as 0.
- `'SKIP'`: the directive is passed over for any tied set where it happens.

### denominator

`denominator: 'EXPECTED'` makes `setsPct` and `gamesPct` divide by the sets and games a participant was expected to
play. For example, a walkover win counts as sets the winner was due to play. The engine works the expected meetings
out from the group itself (any number of meetings per pair). `'PLAYED'` (default) divides by what was actually played.

### Completion

A group is complete when every meeting has a result, so a double round robin and a group with an excluded status
(`excludeMatchUpStatuses`) complete, and their order is written as `groupOrder`. Before the standings engine, they
only ever received `provisionalOrder`.

### groupTotalGamesPlayed / groupTotalSetsPlayed

**Purpose:** Use total group games/sets as denominator for percentage calculations.

**Example scenario:**

```text
4 participants in round robin (6 total matches):
- Participant A: 12 games won, 6 games lost
- Participant B: 10 games won, 8 games lost
- Participant C: 8 games won, 10 games lost
- Participant D: 6 games won, 12 games lost
Total: 36 games won, 36 games lost (72 games total)
```

**Without groupTotalGamesPlayed:**

```javascript
A: 12/18 = 66.7%
B: 10/18 = 55.6%
C: 8/18 = 44.4%
D: 6/18 = 33.3%
Total: 200%
```

**With groupTotalGamesPlayed:**

```javascript
A: 12/72 = 16.7%
B: 10/72 = 13.9%
C: 8/72 = 11.1%
D: 6/72 = 8.3%
Total: 50% (games won / total games)
```

---

## Credit for Incomplete Matches

### setsCreditForDefaults / setsCreditForWalkovers / setsCreditForRetirements

**Purpose:** Award winner full sets when opponent doesn't complete match.

**Default:** All false

**Example:**

```javascript
// Best of 3 (2 sets to win)
// Match: A vs B, score 6-3, B retires

// Without setsCreditForRetirements:
A: 1 set won

// With setsCreditForRetirements:
A: 2 sets won (awarded setsToWin)
```

**Policy:**

```javascript
{
  setsCreditForRetirements: true,
  setsCreditForDefaults: true,
  setsCreditForWalkovers: true,
}
```

---

### gamesCreditForDefaults / gamesCreditForWalkovers / gamesCreditForRetirements

**Purpose:** Award winner estimated games when opponent doesn't complete match.

**Default:** All false

**Example:**

```javascript
// Best of 3, standard scoring (6 games per set)
// Match: A vs B, score 6-3, B retires

// Without gamesCreditForRetirements:
A: 6 games won

// With gamesCreditForRetirements:
A: 12 games won (estimated from setsToWin * 6)
```

---

### gamesCreditForTiebreakSets

**Purpose:** Count tiebreak set as 1 game won.

**Default:** true

**Example:**

```javascript
// Match: A vs B, score 6-3 3-6 [10-5]

// With gamesCreditForTiebreakSets: true
A: 6 + 3 + 1 = 10 games won
B: 3 + 6 = 9 games won

// With gamesCreditForTiebreakSets: false
A: 6 + 3 = 9 games won
B: 3 + 6 = 9 games won
```

**Policy:**

```javascript
{
  gamesCreditForTiebreakSets: false,  // Don't count [10-x] as game
}
```

---

## Disqualification

### disqualifyDefaults / disqualifyWalkovers

**Purpose:** A participant who conceded a walkover (`disqualifyWalkovers`) or a default (`disqualifyDefaults`) is
ordered below every participant who conceded none, whatever their record. The disqualified participants are then
ordered among themselves by the same policy. A retirement does not disqualify.

**Default:** true in the built-in default, JTT and TOC policies.

Implemented by the standings engine. Before it, these flags were declared in the built-in policies but read by no code,
so a participant who conceded a walkover was ordered by their record like anyone else.

**Example:**

```javascript
// 4 participants:
// A: 2-1
// B: 2-1
// C: 1-2
// D: 1-2 (with 1 DEFAULT)

// With disqualifyDefaults: true
Order: A, B, C, D (4th - pushed to bottom)

// With disqualifyDefaults: false
Order: A, B, C/D tied (use tiebreakers)
```

**Policy:**

```javascript
{
  disqualifyDefaults: true,
  disqualifyWalkovers: true,
}
```

---

## Exclude Match Statuses

### excludeMatchUpStatuses

**Purpose:** Exclude specific match statuses from tally calculations.

**Use cases:**

- Exclude ABANDONED matches
- Exclude INCOMPLETE matches
- Exclude matches that shouldn't count toward standings

**Example:**

```javascript
{
  excludeMatchUpStatuses: ['ABANDONED', 'INCOMPLETE'],
}
```

**Effect:**

- Excluded matches don't count toward wins/losses
- Not included in percentage calculations
- Treated as if they never happened

---

## GEMscore

**Purpose:** Create composite score from multiple attributes.

**Formula:** Weighted combination of percentage attributes

**Attributes:**

- `matchUpsPct`
- `tieMatchUpsPct`
- `setsPct`
- `gamesPct`
- `pointsPct`

**Result:**

```javascript
participantResults: {
  participantId123: {
    matchUpsWon: 2,
    matchUpsLost: 1,
    matchUpsPct: 0.667,
    setsPct: 0.714,
    gamesPct: 0.650,
    GEMscore: 85234567, // Composite integer score
  }
}
```

**Usage:**

- Alternative ranking metric
- Visual representation of overall performance
- Can be used as tiebreaker attribute

---

## Usage Examples

### Example 1: Standard Tournament

```javascript
import { fixtures, policyConstants } from 'tods-competition-factory';
const { POLICY_TYPE_ROUND_ROBIN_TALLY } = policyConstants;
const { POLICY_ROUND_ROBIN_TALLY_DEFAULT } = fixtures.policies;

const tournament = {
  policyDefinitions: POLICY_ROUND_ROBIN_TALLY_DEFAULT,
};

tournamentEngine.generateDrawDefinition({
  drawType: ROUND_ROBIN,
  policyDefinitions: tournament.policyDefinitions,
  drawSize: 16,
  // ... other options
});
```

---

### Example 2: Custom Tiebreaking

```javascript
const customPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Custom Tournament 2024',
    groupOrderKey: 'matchUpsWon',

    tallyDirectives: [
      // 1. Head-to-head if exactly 2 tied
      {
        attribute: 'matchUpsPct',
        idsFilter: true,
        maxParticipants: 2,
      },

      // 2. Games percentage (all matches)
      {
        attribute: 'gamesPct',
        idsFilter: false,
      },

      // 3. Sets percentage (all matches)
      {
        attribute: 'setsPct',
        idsFilter: false,
      },

      // 4. Games won among tied teams
      {
        attribute: 'gamesWon',
        idsFilter: true,
      },

      // 5. Fewest games lost
      {
        attribute: 'gamesLost',
        idsFilter: false,
        reversed: true,
      },
    ],

    disqualifyDefaults: true,
    disqualifyWalkovers: true,
  },
};
```

---

### Example 3: Team Tennis (TEAM Events)

```javascript
const teamPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Team Championship',
    groupOrderKey: 'tieMatchUpsWon', // Individual matches won

    tallyDirectives: [
      // Team match record among tied teams
      {
        attribute: 'matchUpsPct',
        idsFilter: true,
        maxParticipants: 2,
      },

      // Individual matches won
      {
        attribute: 'tieMatchUpsWon',
        idsFilter: false,
      },

      // Singles matches won
      {
        attribute: 'tieSinglesWon',
        idsFilter: false,
      },

      // Doubles matches won
      {
        attribute: 'tieDoublesWon',
        idsFilter: false,
      },

      // Sets won
      {
        attribute: 'setsWon',
        idsFilter: false,
      },
    ],
  },
};
```

---

### Example 4: Games-Based Ranking

```javascript
const gamesPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Games Primary',
    groupOrderKey: 'gamesWon',

    tallyDirectives: [
      // Most games won
      {
        attribute: 'gamesWon',
        idsFilter: false,
      },

      // Fewest games lost
      {
        attribute: 'gamesLost',
        idsFilter: false,
        reversed: true,
      },

      // Game percentage
      {
        attribute: 'gamesPct',
        idsFilter: false,
      },

      // Head-to-head if 2 teams
      {
        attribute: 'matchUpsPct',
        idsFilter: true,
        maxParticipants: 2,
      },
    ],

    // Award games for walkovers/defaults
    gamesCreditForWalkovers: true,
    gamesCreditForDefaults: true,
  },
};
```

---

### Example 5: Hockey-Style with Penalty Minutes

```javascript
const hockeyPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Hockey Tournament',
    groupOrderKey: 'matchUpsWon',

    tallyDirectives: [
      // Head-to-head (2 teams only)
      {
        attribute: 'matchUpsPct',
        idsFilter: true,
        maxParticipants: 2,
      },

      // Most wins
      {
        attribute: 'matchUpsWon',
        idsFilter: false,
      },

      // Goal average (custom attribute - would need implementation)
      // { attribute: 'goalAverage', idsFilter: false },

      // Fewest penalty minutes (custom attribute)
      // { attribute: 'penaltyMinutes', idsFilter: false, reversed: true },

      // Fallback to games
      {
        attribute: 'gamesPct',
        idsFilter: false,
      },
    ],
  },
};
```

---

## Best Practices

### 1. Always Provide Fallback Directives

```javascript
// ✓ GOOD: Multiple tiebreakers
tallyDirectives: [
  { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
  { attribute: 'gamesPct', idsFilter: false },
  { attribute: 'gamesWon', idsFilter: false },
  { attribute: 'gamesLost', idsFilter: false, reversed: true },
];

// ✗ BAD: Single tiebreaker might not resolve all ties
tallyDirectives: [{ attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 }];
```

---

### 2. Use maxParticipants for Head-to-Head

```javascript
// ✓ GOOD: Only apply head-to-head when it makes sense
{
  attribute: 'matchUpsPct',
  idsFilter: true,
  maxParticipants: 2  // Skip if 3+ teams (circular ties possible)
}

// ✗ RISKY: Head-to-head with 3+ teams can be indeterminate
{
  attribute: 'matchUpsPct',
  idsFilter: true  // May not separate circular ties
}
```

---

### 3. Order Directives Logically

```javascript
// ✓ GOOD: Broad criteria first, narrow criteria later
tallyDirectives: [
  { attribute: 'matchUpsPct', idsFilter: false }, // Overall record
  { attribute: 'setsPct', idsFilter: false }, // Overall sets
  { attribute: 'matchUpsPct', idsFilter: true }, // Head-to-head
  { attribute: 'setsPct', idsFilter: true }, // H2H sets
];

// ✗ CONFUSING: Narrow then broad
tallyDirectives: [
  { attribute: 'matchUpsPct', idsFilter: true }, // H2H first
  { attribute: 'matchUpsPct', idsFilter: false }, // Then overall
];
```

---

### 4. Document Tournament-Specific Rules

```javascript
const tournamentPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Spring Championship 2024',
    // Document: "Per tournament regulations section 5.3"
    groupOrderKey: 'matchUpsWon',
    tallyDirectives: [
      // Rule 5.3.1: Head-to-head if 2 teams tied
      { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
      // Rule 5.3.2: Games won percentage
      { attribute: 'gamesPct', idsFilter: false },
      // Rule 5.3.3: Fewest games lost
      { attribute: 'gamesLost', idsFilter: false, reversed: true },
    ],
  },
};
```

---

## Related Documentation

- **[maxParticipants](./maxParticipants.md)** - Threshold-based tiebreaking rules
- **[Seeding Policy](./seedingPolicy.md)** - How participants are seeded into draws
- **[Feed-In Policy](./feedInPolicy.md)** - Consolation feed patterns
- **[Policies Overview](../concepts/policies.md)** - All policy types

---

## Methods

### tallyParticipantResults

Calculate participant results and group order based on the round robin tally policy.

```javascript
import { competitionEngine } from 'tods-competition-factory';
const { tallyParticipantResults } = competitionEngine;

const { participantResults, order, report, readableReport } = tallyParticipantResults({
  matchUps, // Array of matchUps
  policyDefinitions, // Policy definitions object
  matchUpFormat, // Optional default format
  generateReport: true, // Optional: generate detailed tiebreaking report
});

// participantResults: {
//   [participantId]: {
//     matchUpsWon: number;
//     matchUpsLost: number;
//     setsWon: number;
//     setsLost: number;
//     gamesWon: number;
//     gamesLost: number;
//     pointsWon: number;
//     pointsLost: number;
//     matchUpsPct: number;
//     setsPct: number;
//     gamesPct: number;
//     pointsPct: number;
//     defaults: number;
//     walkovers: number;
//     retirements: number;
//     allDefaults: number;
//     groupOrder: number;      // Final placement (when bracket complete)
//     provisionalOrder: number; // Current placement (when incomplete)
//     GEMscore?: number;       // If configured
//   }
// }
```

:::tip Understanding Tiebreaking
When `generateReport: true`, the function returns detailed information showing **exactly how tiebreaks were resolved step-by-step**. This is invaluable for:

- Explaining to participants why they finished in a specific position
- Verifying that tiebreaking followed the expected policy
- Debugging complex tiebreaking scenarios
- Creating transparent tournament reports

See **[Query Governor - tallyParticipantResults](../governors/query-governor.md#tallyparticipantresults)** for complete documentation of the `generateReport` parameter and examples of using the tiebreaking report.
:::

---

## Notes

### groupOrder vs provisionalOrder

- **groupOrder:** Assigned when bracket is complete
- **provisionalOrder:** Assigned when bracket is incomplete
- See `provisionalPositioning` in [Draws Governor](../governors/draws-governor.md)

### Bracket Completion

Group order is ONLY assigned when all required matchUps are complete:

```javascript
const bracketComplete = relevantMatchUps.filter((matchUp) => isComplete(matchUp)).length === relevantMatchUps.length;

if (bracketComplete && groupOrder) {
  // Assign groupOrder to participantResults
}
```

For incomplete brackets, use `provisionalOrder` instead.

### Circular Ties

With 3+ participants, circular ties are possible:

- Team A beats Team B
- Team B beats Team C
- Team C beats Team A
- All teams 1-1 head-to-head

**Solution:** Use `maxParticipants: 2` on head-to-head rules to skip circular tie scenarios.

See [maxParticipants documentation](./maxParticipants.md) for details.

---

## Validation

A tally policy is checked where it is saved: `attachPolicies` and `validateSeason` (for a season's or tier's
`tallyPolicy`) refuse it with `INVALID_VALUES` when it names an unknown `groupOrderKey` or directive `attribute`, has a
`precision` that is not a whole number of places, `headToHead` that is not an object, or invalid drawn-result options
(`drawCredit`, `outcomePoints`, `standingsPoints` without `outcomePoints`). `validateTallyPolicy({ tallyPolicy })`
runs the same checks on its own. Previously an unknown `groupOrderKey` was accepted and silently ranked by
`matchUpsWon`. A season standings calculation does not refuse for its policy; the season was checked when saved.

---

## Testing

Comprehensive test coverage in `src/tests/documentation/roundRobinTallyPolicy.test.ts`:

- ✅ All built-in policies
- ✅ Precision calculations
- ✅ maxParticipants thresholds
- ✅ Reversed attributes
- ✅ Disqualification rules
- ✅ Exclude match statuses
- ✅ Credit for incomplete matches
- ✅ groupTotals calculations
- ✅ idsFilter scoping
- ✅ Head-to-head configurations
- ✅ GEMscore generation
- ✅ TEAM event statistics
- ✅ Circular tie scenarios
