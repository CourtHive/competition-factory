import {
  COACH,
  CONFLICT_BLOCK,
  CONFLICT_DECLARED_RELATIONSHIP,
  CONFLICT_NATIONALITY,
  CONFLICT_ORGANISATION,
  CONFLICT_SAME_PERSON,
  CONFLICT_SHARED_GROUPING,
  MEDICAL,
  PHYSIO,
  POLICY_TYPE_OFFICIATING_CONFLICT,
  TRAINER,
} from '../constants';

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
};

/**
 * ITF-oriented variant: nationality is an active, blocking consideration for
 * international events.
 */
export const TEMPLATE_OFFICIATING_CONFLICT_OF_INTEREST_ITF = {
  [POLICY_TYPE_OFFICIATING_CONFLICT]: {
    policyName: 'ITF',
    conflictRules: {
      [CONFLICT_SAME_PERSON]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_DECLARED_RELATIONSHIP]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_ORGANISATION]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_NATIONALITY]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_SHARED_GROUPING]: {
        enabled: true,
        severity: CONFLICT_BLOCK,
        roleSeverity: DISQUALIFYING_GROUP_ROLES,
      },
    },
  },
};
