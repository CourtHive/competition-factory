import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import {
  CONFLICT_DECLARED_RELATIONSHIP,
  CONFLICT_ORGANISATION,
  CONFLICT_NATIONALITY,
  CONFLICT_SAME_PERSON,
  CONFLICT_BLOCK,
  CONFLICT_WARN,
} from '@Constants/officiatingConstants';

/**
 * Default conflict-of-interest policy for official assignment.
 *
 * NATIONALITY is deliberately `enabled: false` here rather than merely set to
 * WARN. A shared nationality is disqualifying at ITF-level international events
 * and meaningless at national ones, where every official necessarily shares the
 * players' nationality — enabling it by default would make the check noise at
 * the majority of events that use the default policy. Federations that need it
 * enable it in their own policy; see POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF.
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
    },
  },
};

/**
 * ITF-oriented variant: nationality is an active, blocking consideration for
 * international events.
 */
export const POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF = {
  [POLICY_TYPE_OFFICIATING_CONFLICT]: {
    policyName: 'ITF',
    conflictRules: {
      [CONFLICT_SAME_PERSON]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_DECLARED_RELATIONSHIP]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_ORGANISATION]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_NATIONALITY]: { enabled: true, severity: CONFLICT_BLOCK },
    },
  },
};
