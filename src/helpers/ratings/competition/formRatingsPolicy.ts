import { POLICY_RATINGS_COMPETITION_FORM } from '@Fixtures/policies/POLICY_RATINGS_COMPETITION_FORM';
import { resolveRatingsPolicy } from '../ratingsPolicyRules';

// constants and types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ErrorType } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

const FORM = POLICY_RATINGS_COMPETITION_FORM[POLICY_TYPE_RATINGS];

/**
 * The ratings policy a competition's dynamic form rating moves by. Named in `dynamicFormRating.ratingsPolicy`, it sets
 * the expectation, K (CONSTANT only: a competition holds no career counts) and the actual result. Without one, the
 * rating is today's: the policy's own `kFactor` and `logisticScale`, else POLICY_RATINGS_COMPETITION_FORM's 24 and 400,
 * with the actual output the competition policy computes (`referenced: false`).
 */
export function formRatingsPolicy(competitionPolicy?: CompetitionPolicy): {
  policy?: RatingsPolicy;
  referenced?: boolean;
  error?: ErrorType;
  info?: string;
} {
  const form = competitionPolicy?.ratingPolicy?.dynamicFormRating;
  if (form?.ratingsPolicy === undefined) return { policy: fallbackFormPolicy(competitionPolicy) };
  const policy = resolveRatingsPolicy(form.ratingsPolicy);
  if (!policy) return { error: INVALID_VALUES, info: 'dynamicFormRating.ratingsPolicy: no such ratings policy' };
  if (policy.k.rule !== 'CONSTANT') {
    return {
      error: INVALID_VALUES,
      info: 'dynamicFormRating.ratingsPolicy: a competition form rating needs a CONSTANT K',
    };
  }
  return { policy, referenced: true };
}

/** Today's form rating: the policy's own `kFactor` and `logisticScale`, else POLICY_RATINGS_COMPETITION_FORM's 24 and 400. */
export function fallbackFormPolicy(competitionPolicy?: CompetitionPolicy): RatingsPolicy {
  const form = competitionPolicy?.ratingPolicy?.dynamicFormRating;
  const spread = form?.logisticScale ?? FORM.expectation.spread;
  const value = form?.kFactor ?? FORM.k.value;
  return { ...FORM, expectation: { ...FORM.expectation, spread }, k: { rule: 'CONSTANT', value } };
}
