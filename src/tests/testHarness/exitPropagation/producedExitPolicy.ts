import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * The policy under which a double exit produces an EXIT, rather than a BYE, for the seat its loser
 * would have taken.
 *
 * `doubleExitPropagateBye` is ON by default since 2026-09-29 — CA: *"two BYEs meeting always
 * produces a BYE"*, and of the tests written before that: *"can't they be updated with a policy that
 * retains the behavior they expect? Aren't they still valid when a double exit doesn't produce a
 * BYE?"* They are. Every test that names this constant is a description of what the engine does for
 * a provider who turns the policy OFF — typically one who awards ranking points by matchUpStatus and
 * needs a first-round WALKOVER told apart from a BYE.
 *
 * So these are pins of a supported configuration, not of a legacy one. Nothing about them was
 * weakened: the assertions are unchanged, and only the policy they were always implicitly running
 * under is now stated.
 */
export const PRODUCED_EXIT_POLICY = {
  [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false },
};
