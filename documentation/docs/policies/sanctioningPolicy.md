---
title: Sanctioning Policy
---

A **sanctioning policy** defines what a governing body requires at each sanctioning tier. It is the rules engine that validates tournament proposals against organizational requirements.

## Policy Structure

```ts
interface SanctioningPolicy {
  policyName: string;           // Human-readable name
  policyVersion: string;        // e.g., "2026.1"
  effectiveDate: string;        // ISO 8601 — when this version takes effect
  supersededDate?: string;      // When replaced by a newer version
  governingBodyId: string;      // Which body this policy belongs to

  tiers: SanctioningTier[];     // Tier definitions with constraints

  // Global requirements
  requireEndorsement?: boolean;
  requireInsurance?: boolean;
  requireSafetyPlan?: boolean;
  requireMedicalPlan?: boolean;
  requireAntiCorruption?: boolean;
  requireSafeguarding?: boolean;
  minimumLeadWeeks?: number;

  // Post-event
  resultsDeadlineDays?: number;
  requirePostEventReport?: boolean;
  postEventRequirements?: PostEventRequirement[];

  // Sub-policy definitions
  personnelRules?: PersonnelRules;
  calendarRules?: CalendarRules;
  amendmentRules?: AmendmentRules;
}
```

## Tier Definitions

Each tier within a policy defines constraints for events sanctioned at that level:

```ts
interface SanctioningTier {
  tierName: string;                 // e.g., "W50", "Level 3"
  tierLevel: number;                // Numeric ordering

  // Event constraints
  allowedEventTypes?: EventTypeUnion[];
  allowedCategories?: Category[];
  allowedGenders?: GenderUnion[];
  allowedDisciplines?: DisciplineUnion[];

  // Draw constraints
  allowedDrawTypes?: DrawTypeUnion[];
  allowedDrawSizes?: number[];
  maxQualifyingDrawSize?: number;
  qualifyingAllowed?: boolean;
  allowedMatchUpFormats?: string[];

  // Financial
  minimumPrizeMoney?: number;
  maximumPrizeMoney?: number;
  sanctionFeePercent?: number;
  sanctionFeeFixed?: number;

  // Facility
  minimumCourts?: number;
  requireBackdrops?: boolean;
  requireScoreboards?: boolean;

  // Personnel
  minimumOfficials?: number;
  officialCertificationLevel?: string;
  tdRefereeSameAllowed?: boolean;

  // Participants
  minimumParticipants?: number;

  // Progression
  prerequisiteTiers?: string[];
  prerequisiteEventCount?: number;

  // Timing
  minimumLeadWeeks?: number;        // Overrides global
}
```

## Amendment Rules

Controls what modifications are permitted after approval:

```ts
interface AmendmentRules {
  substantialChangeFields?: string[];       // Dot-path patterns; wildcards: "events.*.drawSize"
  noChangeWindowWeeks?: number;             // Hard freeze before event
  substantialChangeWindowWeeks?: number;    // Substantial changes need review
  prizeMoneyIncrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  prizeMoneyDecrease?: 'ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  lateChangePenalty?: boolean;
}
```

## Included Fixtures

### Generic

Basic 3-tier policy for any sport. Draw sizes 8-128, qualifying at Level 2+, prize money floors at Level 2+.

```js
import { POLICY_SANCTIONING_GENERIC } from 'tods-competition-factory/fixtures/policies/POLICY_SANCTIONING_GENERIC';
```

### ITF World Tennis Tour

6 tiers (M15/W15 through W100). Endorsement required. Anti-corruption and safeguarding required. Lead times: 16 weeks (M15-W50), 21 weeks (W75-W100). 9-week no-change window.

```js
import { POLICY_SANCTIONING_ITF } from 'tods-competition-factory/fixtures/policies/POLICY_SANCTIONING_ITF';
```

### USTA

7 levels (Level 7 local through Level 1 national). Safeguarding required. Progressive prerequisites (must run lower-tier events before advancing). TD/Referee cannot be same person at Level 5+. Minimum participant thresholds at higher levels.

```js
import { POLICY_SANCTIONING_USTA } from 'tods-competition-factory/fixtures/policies/POLICY_SANCTIONING_USTA';
```

## Policy Versioning

Policies carry `policyVersion` and `effectiveDate`. When a sanctioning application is submitted via `submitApplication()`, the current policy is snapshot'd onto the record as `policySnapshot`. All subsequent validation for that record uses the snapshot, matching real-world practice where the rules in effect at sanctioning time govern that tournament.
