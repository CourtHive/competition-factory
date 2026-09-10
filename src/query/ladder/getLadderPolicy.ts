import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { POLICY_LADDER_DEFAULT } from '@Fixtures/policies/POLICY_LADDER_DEFAULT';

import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { RANK, SWAP } from '@Constants/ladderConstants';
import type { LadderMovement, LadderOrdering } from '@Constants/ladderConstants';
import type { LadderPolicy } from '@Types/ladderTypes';

type LadderPolicyArgs = {
  tournamentRecord?: any;
  drawDefinition?: any;
  structure?: any;
  event?: any;
};

const DEFAULTS = POLICY_LADDER_DEFAULT[POLICY_TYPE_LADDER] as LadderPolicy;

/**
 * The ladder policy in force, with defaults filled in.
 *
 * Resolution follows the ordinary policy hierarchy (structure → draw → event → tournament), so a
 * ladder inherits a club-wide policy and can override it per draw, exactly as scoring and
 * scheduling policies do. An absent policy is not an error: a ladder with no policy attached runs
 * on the defaults.
 */
export function getLadderPolicy(params: LadderPolicyArgs): LadderPolicy {
  const { policyDefinitions } = getPolicyDefinitions({ ...params, policyTypes: [POLICY_TYPE_LADDER] });
  const attached = (policyDefinitions?.[POLICY_TYPE_LADDER] ?? {}) as LadderPolicy;
  return { ...DEFAULTS, ...attached };
}

/**
 * THE SEAM. Ask this — never `policy.ordering`, and never assume `positionAssignments` is the
 * source of truth.
 *
 * Under `RANK` the standing is `positionAssignments` and a completed challenge mutates it. Under
 * `RATING` the standing is derived from the rating scale, `positionAssignments` is a projection,
 * and none of the movement rules apply. Reading the ordering through one accessor is what keeps
 * `RATING` an addition later rather than a rewrite of everything built on top of `RANK`.
 */
export function getLadderOrdering(params: LadderPolicyArgs): LadderOrdering {
  return getLadderPolicy(params).ordering ?? RANK;
}

/** `RANK` ordering only — under `RATING` there is no movement to describe. */
export function getLadderMovement(params: LadderPolicyArgs): LadderMovement {
  return getLadderPolicy(params).movement ?? SWAP;
}

/**
 * Whether `challengerPosition` may challenge `defenderPosition`.
 *
 * A challenge is upward only — challenging someone below you is not a ladder move — and bounded by
 * the policy's range. `ANY` permits anyone above.
 */
export function isChallengeInRange(
  params: LadderPolicyArgs & {
    defenderPosition: number;
    challengerPosition: number;
    /** Optional: resolved from `drawDefinition` when absent, so an engine caller can pass `drawId`. */
    policy?: LadderPolicy;
  },
): boolean {
  const { defenderPosition, challengerPosition } = params;
  if (!(defenderPosition < challengerPosition)) return false; // upward only; equal is not a challenge
  const policy = params.policy ?? getLadderPolicy(params);
  const range = policy.challengeRange ?? DEFAULTS.challengeRange;
  if (range === 'ANY') return true;
  return typeof range === 'number' && challengerPosition - defenderPosition <= range;
}
