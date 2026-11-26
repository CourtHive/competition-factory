import { resolveRatingsPolicy } from './ratingsPolicyRules';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// types
import type { competitionFormat } from '@Types/competitionFormat';

/**
 * The competitionFormat to store when one is attached. A `ratingsPolicy` that names a preset is replaced by the
 * preset's full policy, a copy, so a stored record never needs the name looked up when it is read; the name is kept
 * as `ratingsPolicyName`, a label only. An inline policy, or none, is stored as given. A name the factory does not know
 * is stored as given too, as before, and `generateDynamicRatings` refuses it by name when it rates.
 */
export function pinnedCompetitionFormat(format: competitionFormat): competitionFormat {
  const selected = format?.ratingsPolicy;
  if (typeof selected !== 'string') return format;
  const policy = resolveRatingsPolicy(selected);
  if (!policy) return format;
  return { ...format, ratingsPolicy: makeDeepCopy(policy, false, true), ratingsPolicyName: selected };
}
