import { COACH, MEDICAL, PHYSIO, TRAINER } from '@Constants/participantRoles';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import {
  CONFLICT_DECLARED_RELATIONSHIP,
  CONFLICT_SHARED_GROUPING,
  CONFLICT_ORGANISATION,
  CONFLICT_NATIONALITY,
  CONFLICT_SAME_PERSON,
  CONFLICT_BLOCK,
  CONFLICT_WARN,
} from '@Constants/officiatingConstants';
import type { ConflictOfInterestPolicy, ConflictSeverity } from '@Types/officiatingTypes';

/**
 * GROUP participantRoles that represent a relationship close enough to disqualify an official.
 * A GROUP carrying one of these was authored to express that relationship; a GROUP with no role
 * (a squad, an attribute-derived grouping) is incidental and only warns.
 */
const DISQUALIFYING_GROUP_ROLES = {
  [COACH]: CONFLICT_BLOCK,
  [MEDICAL]: CONFLICT_BLOCK,
  [PHYSIO]: CONFLICT_BLOCK,
  [TRAINER]: CONFLICT_BLOCK,
} satisfies Record<string, ConflictSeverity>;

/**
 * Default conflict-of-interest policy for official assignment.
 *
 * NATIONALITY is deliberately `enabled: false` here rather than merely set to
 * WARN. A shared nationality is disqualifying at ITF-level international events
 * and meaningless at national ones, where every official necessarily shares the
 * players' nationality — enabling it by default would make the check noise at
 * the majority of events that use the default policy. Federations that need it
 * enable it in their own policy (the catalogue package publishes an ITF variant that does).
 *
 * SAME_PERSON and DECLARED_RELATIONSHIP block: an official cannot officiate an
 * event they are entered in, and a declared relationship is a positive assertion
 * by the official that they should not be assigned.
 */
export const POLICY_OFFICIATING_CONFLICT_OF_INTEREST = {
  [POLICY_TYPE_OFFICIATING_CONFLICT]: {
    policyName: 'DEFAULT',
    conflictRules: {
      [CONFLICT_SAME_PERSON]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_DECLARED_RELATIONSHIP]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_ORGANISATION]: { enabled: true, severity: CONFLICT_WARN },
      [CONFLICT_NATIONALITY]: { enabled: false, severity: CONFLICT_WARN },
      // Tournament-scoped relationships expressed as GROUP membership. WARN by default because
      // GROUP is a general primitive — squads and attribute-derived groupings are legitimate and
      // would otherwise false-positive. `roleSeverity` escalates the groups that were authored to
      // express a relationship.
      [CONFLICT_SHARED_GROUPING]: {
        enabled: true,
        severity: CONFLICT_WARN,
        roleSeverity: DISQUALIFYING_GROUP_ROLES,
      },
    },
  } satisfies ConflictOfInterestPolicy,
};
