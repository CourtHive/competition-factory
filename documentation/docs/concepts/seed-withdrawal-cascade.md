---
title: Seed Withdrawal Cascade
---

## Overview

When a seeded player withdraws from a tournament **after the draw has been made but before play begins**, governing bodies (ITF, ATP, WTA, USTA) require a cascade: one seed from each lower seed block moves up to fill the vacancy, preserving proper seed distribution throughout the draw.

The Competition Factory implements this as the `seedWithdrawalCascade` mutation, available as a position action (`SEED_CASCADE`) when clicking on a seeded participant's draw position.

## Seed Blocks

Seeds are organized into blocks that correspond to their placement in the draw:

| Block | Seeds | Draw Position Purpose         |
| ----- | ----- | ----------------------------- |
| 1     | 1     | Top of draw                   |
| 2     | 2     | Bottom of draw                |
| 3     | 3–4   | Semi-final quarter separation |
| 4     | 5–8   | Quarter-final separation      |
| 5     | 9–16  | Round of 16 separation        |
| 6     | 17–32 | Round of 32 separation        |

The number of populated seed blocks depends on the draw size and seeding policy:

| Draw Size | Max Seeds (Default Policy) | Blocks                         |
| --------- | -------------------------- | ------------------------------ |
| 4         | 2                          | [1], [2]                       |
| 16        | 4                          | [1], [2], [3-4]                |
| 32        | 8                          | [1], [2], [3-4], [5-8]         |
| 64        | 16                         | [1], [2], [3-4], [5-8], [9-16] |

## How the Cascade Works

When a seed withdraws, **one seed from each successive lower block** moves up to fill the vacancy. The cascade stops at the lowest populated block, leaving a single vacancy for the tournament director to fill.

### Example: Seed 3 Withdraws (64-draw, 16 seeds)

```text
Seed 3 (block [3,4]) withdraws
  → Seed 5 (block [5-8]) moves into Seed 3's draw position
    → Seed 9 (block [9-16]) moves into Seed 5's draw position
      → Vacancy at Seed 9's original draw position
```

The tournament director then fills the vacancy at Seed 9's old draw position with an alternate or assigns a BYE.

### Example: Seed 1 Withdraws (16-draw, 4 seeds)

```text
Seed 1 (block [1]) withdraws
  → Seed 2 (block [2]) moves into Seed 1's draw position
    → Seed 3 (block [3,4]) moves into Seed 2's draw position
      → Vacancy at Seed 3's original draw position
```

### Key Rules

- **One replacement per block**: Only the lowest-numbered seed from each lower block moves up — not all seeds shift.
- **Seed assignments update**: When Seed 5 moves to Seed 3's position, Seed 5's participant occupies seed slot 3 in the seed assignments.
- **The vacated position** is wherever the last moved participant was originally placed. This can be anywhere in the draw since seed placement follows block patterns.
- **No cascade from lowest block**: If a seed in the lowest populated block withdraws, there is no cascade — only a vacancy at that position.

## Usage

### As a Position Action

The `SEED_CASCADE` action appears in `positionActions` when:

1. The draw position contains a **seeded participant**
2. The structure is **MAIN stage, sequence 1** (not consolation or playoff)
3. The structure is **not round robin**
4. **No matchUps have been played** (pre-tournament only)
5. At least one **lower seed block has assigned seeds**

```javascript
const { validActions } = tournamentEngine.positionActions({
  drawId,
  structureId,
  drawPosition: seedDrawPosition,
});

const cascadeAction = validActions.find((a) => a.type === 'SEED_CASCADE');
// cascadeAction = {
//   type: 'SEED_CASCADE',
//   method: 'seedWithdrawalCascade',
//   payload: { drawId, structureId, drawPosition }
// }
```

### Direct Mutation

```javascript
const result = tournamentEngine.seedWithdrawalCascade({
  drawId,
  structureId,
  drawPosition: withdrawnSeedDrawPosition,
});

// result = {
//   success: true,
//   vacatedDrawPosition: 13  // where the TD needs to fill
// }
```

### After the Cascade

The `vacatedDrawPosition` in the result tells the tournament director which position needs to be filled. They can:

- Assign an **alternate** using the standard `alternateDrawPositionAssignment` action
- Assign a **BYE** using the `assignDrawPositionBye` action
- Assign a **lucky loser** if applicable

## Timing Constraints

Per ITF/ATP/WTA regulations:

- **Before order of play released**: Full cascade applies — seeds move into higher seed positions
- **After order of play released**: No cascade — the vacancy is filled directly by an alternate or lucky loser using the standard `withdrawParticipantAtDrawPosition` action

The `seedWithdrawalCascade` mutation enforces the pre-play constraint by checking that no matchUps have active draw positions.

## Governing Body References

- **ITF**: "Any vacancy created by the withdrawal of a seed shall be filled by the next highest ranked player eligible to be seeded"
- **ATP/WTA**: Next eligible player takes the withdrawing seed's position; the remaining vacancy is filled by an alternate/lucky loser
- **USTA**: Seed replacement follows the same cascade principle with policy-defined seed count thresholds
