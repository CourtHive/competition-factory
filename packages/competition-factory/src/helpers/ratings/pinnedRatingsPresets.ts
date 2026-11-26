import { resolveRatingsPolicy } from './ratingsPolicyRules';

// types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';
import type { competitionFormat } from '@Types/competitionFormat';
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * Where a ratings preset can be named in something stored: a competitionFormat's `ratingsPolicy`, and a competition
 * policy's `dynamicFormRating.ratingsPolicy`. When one is attached, a name is replaced by the preset's full policy, a
 * copy, so a stored record never needs the name looked up when it is read; the name is kept beside it as
 * `ratingsPolicyName`, a label only. An inline policy, or none, is stored as given. A name the factory does not know is
 * stored as given too, as before, and is refused by name when a rating reads it.
 */

/** The preset `selected` names, copied, or `undefined` when it is not a name the factory holds. */
function pinnedPreset(selected: unknown): RatingsPolicy | undefined {
  if (typeof selected !== 'string') return undefined;
  const policy = resolveRatingsPolicy(selected);
  return policy && plainCopy(policy);
}

/** A copy of plain data (objects, arrays and primitives), which a ratings preset is. */
function plainCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(plainCopy) as T;
  if (value === null || typeof value !== 'object') return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = plainCopy((value as Record<string, unknown>)[key]);
  return copy as T;
}

/** The competitionFormat to store when one is attached (`addEvent`, `modifyEvent`). */
export function pinnedCompetitionFormat(format: competitionFormat): competitionFormat {
  const policy = pinnedPreset(format?.ratingsPolicy);
  if (!policy) return format;
  return { ...format, ratingsPolicy: policy, ratingsPolicyName: format.ratingsPolicy as string };
}

/** The competition policy to store when one is attached (`attachPolicies`). */
export function pinnedCompetitionPolicy(competitionPolicy: CompetitionPolicy): CompetitionPolicy {
  const form = competitionPolicy?.ratingPolicy?.dynamicFormRating;
  const policy = pinnedPreset(form?.ratingsPolicy);
  if (!policy) return competitionPolicy;
  const dynamicFormRating = { ...form, ratingsPolicy: policy, ratingsPolicyName: form.ratingsPolicy as string };
  return { ...competitionPolicy, ratingPolicy: { ...competitionPolicy.ratingPolicy, dynamicFormRating } };
}
