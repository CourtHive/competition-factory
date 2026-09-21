import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';

// constants and types
import { POLICY_TYPE_SANCTIONING } from '@Constants/policyConstants';
import type { SanctioningPolicy } from '@Types/sanctioningTypes';
import { COMPETITOR } from '@Constants/participantRoleValues';
import type { Attribution } from '@Types/presenceTypes';
import type { Category } from '@Types/tournamentTypes';
import type {
  AttributionCategoryRule,
  AttributionRule,
  OnInvalidAttribution,
  PresenceExpectation,
  PresenceFact,
  PresenceRoleRules,
  PresenceRules,
} from '@Types/presencePolicyTypes';

/**
 * The presence rules in force, resolved through the ordinary policy hierarchy
 * (structure → draw → event → tournament), exactly as `getLadderPolicy` resolves its own.
 *
 * Returns `undefined` when no sanctioning policy declares `presence`. That is **not** the same as
 * declaring `notUsed`, and callers must keep the two apart: an undeclared tournament is one where the
 * question was never answered, so a client's own heuristic is still the best available answer for it.
 * `POLICY_TYPE_SANCTIONING` is optional and most tournaments will carry none indefinitely.
 */
export function getPresenceRules(params: {
  tournamentRecord?: any;
  drawDefinition?: any;
  structure?: any;
  event?: any;
}): PresenceRules | undefined {
  const { policyDefinitions } = getPolicyDefinitions({ ...params, policyTypes: [POLICY_TYPE_SANCTIONING] });
  const sanctioning = policyDefinitions?.[POLICY_TYPE_SANCTIONING] as SanctioningPolicy | undefined;
  return sanctioning?.presence;
}

/**
 * A participant's role for presence purposes.
 *
 * An absent `participantRole` resolves to COMPETITOR. `participantType` says what a participant IS;
 * `participantRole` says what they DO, and a record written before roles existed carries players with
 * no role — never people with no part to play. Reading the absence as "no rule applies" would silently
 * exempt exactly the population the rules are mostly about.
 */
export function presenceRoleOf(participant?: any): string {
  return participant?.participantRole ?? COMPETITOR;
}

/**
 * What the policy expects of this role for this fact.
 *
 * ⚠️ Returns a POLICY VALUE, not an instruction. `required` does not mean "block" — D4d's finding is
 * that a hard block teaches pre-emptive compliance and destroys the signal. Each surface decides what
 * to do with it; the factory refuses nothing on this basis.
 *
 * `declared: false` distinguishes "the policy says notUsed" from "no policy said anything", which are
 * the two states a client's heuristic exists to tell apart.
 */
export function getPresenceExpectation(params: {
  tournamentRecord?: any;
  drawDefinition?: any;
  participant?: any;
  fact: PresenceFact;
  structure?: any;
  event?: any;
}): { expectation?: PresenceExpectation; declared: boolean; role: string } {
  const { fact, participant, ...resolution } = params;
  const role = presenceRoleOf(participant);
  const rules = getPresenceRules(resolution);

  if (!rules) return { declared: false, role };

  const roleRules: PresenceRoleRules | undefined = rules[role];
  const expectation = roleRules?.[fact]?.expectation;

  // A policy that names the role but not this fact has still not answered THIS question.
  if (!expectation) return { declared: false, role };

  return { expectation, declared: true, role };
}

/** The first category rule that matches the event's category, or undefined. */
function matchingCategoryRule(rule: AttributionRule, category?: Category): AttributionCategoryRule | undefined {
  if (!category) return undefined;
  return rule.byCategory?.find((candidate) => {
    // An entry with neither selector never matches: a rule applying to everything would silently
    // shadow the outer rule it was written to refine.
    const selectors = [candidate.ageCategoryCode, candidate.categoryName].filter(Boolean);
    if (!selectors.length) return false;
    if (candidate.ageCategoryCode && candidate.ageCategoryCode !== category.ageCategoryCode) return false;
    if (candidate.categoryName && candidate.categoryName !== category.categoryName) return false;
    return true;
  });
}

export type AttributionValidation = {
  onInvalid: OnInvalidAttribution;
  categoryApplied?: string;
  declared: boolean;
  reason?: string;
  valid: boolean;
};

/**
 * Is this attester permitted by the policy in force?
 *
 * The U10 case is why `byCategory` exists: a federation requiring self-attestation from adults
 * routinely permits a PARENT, GUARDIAN or CHAPERONE to sign in a ten-year-old. A matching category
 * rule **replaces** the outer lists rather than merging with them, so a junior event can be stricter
 * as well as looser — some federations do go that way.
 *
 * An absent policy, an absent rule, or an absent attester is always `valid`. Silence is not a refusal,
 * and this function is consulted on every check-in at every tournament, most of which declare nothing.
 */
export function validatePresenceAttribution(params: {
  attributedTo?: Attribution;
  tournamentRecord?: any;
  drawDefinition?: any;
  participant?: any;
  fact: PresenceFact;
  category?: Category;
  structure?: any;
  event?: any;
}): AttributionValidation {
  const { attributedTo, category, fact, participant, ...resolution } = params;

  const rules = getPresenceRules(resolution);
  const rule = rules?.[presenceRoleOf(participant)]?.[fact]?.attribution;
  const onInvalid: OnInvalidAttribution = rule?.onInvalid ?? 'record';

  if (!rule || !attributedTo) return { valid: true, declared: !!rule, onInvalid };

  const categoryRule = matchingCategoryRule(rule, category ?? params.event?.category);
  const allow = categoryRule?.allow ?? rule.allow;
  const allowedRelationships = categoryRule?.allowedRelationships ?? rule.allowedRelationships;
  const categoryApplied = categoryRule?.ageCategoryCode ?? categoryRule?.categoryName;

  if (allow?.length && !allow.includes(attributedTo.attributionType)) {
    return {
      reason: `attributionType ${attributedTo.attributionType} is not permitted`,
      declared: true,
      categoryApplied,
      valid: false,
      onInvalid,
    };
  }

  if (allowedRelationships?.length) {
    const relationship = (attributedTo as any).relationship;
    // An attester with no stated relationship cannot be checked against a relationship list. Refused
    // rather than waved through: a policy that enumerates who may attest is not satisfied by an
    // attester who declines to say which of them they are.
    if (!relationship || !allowedRelationships.includes(relationship)) {
      return {
        reason: relationship
          ? `relationship ${relationship} is not permitted`
          : 'attester states no relationship, and the policy enumerates relationships',
        declared: true,
        categoryApplied,
        valid: false,
        onInvalid,
      };
    }
  }

  return { valid: true, declared: true, categoryApplied, onInvalid };
}
