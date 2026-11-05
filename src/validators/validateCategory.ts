import { parseCategoryAgeDetails } from '@Helpers/categories/parseCategoryAgeDetails';
import { decorateResult } from '@Functions/global/decorateResult';
import { competitionUtcDate } from '@Tools/clock';
import { isObject } from '@Tools/objects';
import { isNumeric } from '@Tools/math';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

export function validateCategory({ category }) {
  if (!isObject(category)) return { error: INVALID_VALUES };

  // no tournament here, so the competition's UTC date, as the engine method resolves it without one
  const categoryDetails = parseCategoryAgeDetails({ category, today: () => ({ date: competitionUtcDate() }) });
  if (categoryDetails.error) return { error: categoryDetails };

  const { ratingMax, ratingMin } = category;

  if (ratingMax && !isNumeric(ratingMax))
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { ratingMax },
    });

  if (ratingMin && !isNumeric(ratingMin))
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { ratingMin },
    });

  return { ...categoryDetails };
}
