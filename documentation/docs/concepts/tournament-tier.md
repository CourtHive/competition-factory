# Tournament Tier

## Overview

`tournamentTier` captures the **competitive prestige classification** of a tournament — the federation-specific tier that determines ranking points, draw size requirements, and prize money bands.

This is orthogonal to `tournamentLevel` (organizational scope: LOCAL, REGIONAL, NATIONAL, INTERNATIONAL). A NATIONAL tournament could be a Grand Slam (top tier) or a J100 (lower tier). The tier tells you _how prestigious_ the tournament is; the level tells you _where it sits_ in the organizational hierarchy.

## TierClassification

```typescript
interface TierClassification {
  /** Federation/governing body tier system (e.g. 'ITF_JUNIOR', 'ATP', 'PPA', 'BWF') */
  system: string;
  /** Tier value within the system (e.g. '3', '1000', 'Gold', 'Super 500') */
  value: string;
  /** Optional sortable prestige rank within the system (lower = more prestigious) */
  numericRank?: number;
}
```

### Fields

| Field         | Type   | Required | Description                                                                                                    |
| ------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `system`      | string | yes      | Identifies which federation's tier system this uses                                                            |
| `value`       | string | yes      | The tier label within that system                                                                              |
| `numericRank` | number | no       | Sortable prestige rank (1 = most prestigious). Enables sorting tournaments by prestige without a policy lookup |

### Where it lives

- **`Tournament.tournamentTier`** — the tournament's competitive classification
- **`Event.eventTier`** — optional per-event override (most sports assign tier at tournament level, but some tournaments have mixed-tier events)

Resolution: `event.eventTier ?? tournament.tournamentTier`

## Cross-Sport Examples

| Sport               | System       | Value examples                                                    | numericRank |
| ------------------- | ------------ | ----------------------------------------------------------------- | ----------- |
| Tennis (ITF Junior) | `ITF_JUNIOR` | `1`, `2`, `3`, `J500`, `J300`, `J200`, `J100`                     | 1–9         |
| Tennis (ATP)        | `ATP`        | `Grand Slam`, `1000`, `500`, `250`                                | 1–4         |
| Tennis (WTA)        | `WTA`        | `Grand Slam`, `1000`, `500`, `250`, `125`                         | 1–5         |
| Tennis (ITF Pro)    | `ITF_PRO`    | `M25`, `M15`, `W75`, `W60`, `W35`, `W25`, `W15`                   | varies      |
| Pickleball (PPA)    | `PPA`        | `Major`, `Gold`, `Silver`, `Bronze`                               | 1–4         |
| Badminton (BWF)     | `BWF`        | `Super 1000`, `Super 750`, `Super 500`, `Super 300`, `Super 100`  | 1–5         |
| Table Tennis (ITTF) | `ITTF`       | `Grand Smash`, `Champions`, `Contender`, `Feeder`                 | 1–4         |
| Squash (PSA)        | `PSA`        | `Platinum`, `Gold`, `Silver`, `Bronze`, `Challenger`, `Satellite` | 1–6         |

## Setting Tournament Tier

```javascript
tournamentEngine.setTournamentTier({
  tournamentTier: {
    system: 'ITF_JUNIOR',
    value: 'J500',
    numericRank: 4,
  },
});

// Clear the tier
tournamentEngine.setTournamentTier({ tournamentTier: null });
```

The mutation validates that both `system` and `value` are present and trims whitespace. `numericRank` is optional.

## Ranking Points Integration

### tierToLevel Policy Mapping

Ranking policies can include a `tierToLevel` mapping that translates tier classifications to the numeric levels used in point tables:

```javascript
const policy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ITF Junior Points',
    tierToLevel: {
      ITF_JUNIOR: {
        1: 1, // Grand Slam → Level 1
        2: 2, // Junior Masters → Level 2
        J500: 4, // Grade A → Level 4
        J300: 5,
        J200: 6,
        J100: 7,
      },
    },
    awardProfiles: [
      {
        positionPoints: [
          { position: 1, points: 1000, level: { 1: 10000, 4: 2000, 7: 500 } },
          // ...
        ],
      },
    ],
  },
};
```

### Auto-Resolution

When calling `getEventRankingPoints()` without an explicit `level` parameter, the engine automatically resolves the numeric level from:

1. `event.eventTier` (if set) — checked first
2. `tournament.tournamentTier` — fallback
3. Policy's `tierToLevel[tier.system][tier.value]` — mapping

```javascript
// Before: caller had to know the numeric level
const result = tournamentEngine.getEventRankingPoints({
  policyDefinitions: policy,
  eventId: 'evt-1',
  level: 4, // caller must know ITF J500 = level 4
});

// After: level auto-resolved from tier
tournamentEngine.setTournamentTier({
  tournamentTier: { system: 'ITF_JUNIOR', value: 'J500' },
});
const result = tournamentEngine.getEventRankingPoints({
  policyDefinitions: policy,
  eventId: 'evt-1',
  // level auto-resolved: ITF_JUNIOR.J500 → 4
});
```

An explicit `level` parameter always takes precedence over tier resolution.

## vs tournamentLevel

|               | `tournamentLevel`                                                                    | `tournamentTier`                                    |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **What**      | Organizational scope                                                                 | Competitive prestige                                |
| **Type**      | Enum (CLUB, DISTRICT, REGIONAL, NATIONAL, INTERNATIONAL, ZONAL, LOCAL, RECREATIONAL) | Structured: `{ system, value, numericRank? }`       |
| **Examples**  | NATIONAL                                                                             | `{ system: 'ATP', value: '1000' }`                  |
| **Affects**   | Governance, sanctioning                                                              | Ranking points, draw size requirements, prize money |
| **Universal** | Yes — same across all sports                                                         | No — federation-specific                            |
