import { CATEGORY_SCOPE_FIELDS, PROFILE_SCOPE_FIELDS } from '@Constants/rankingConstants';

import type { AwardProfile, CategoryScope, DateRange } from '@Types/rankingTypes';
import type { Category, EventTypeUnion } from '@Types/tournamentTypes';

/** The slice of a participant's draw participation that scopes profile selection. */
type AwardProfileParticipation = {
  participationOrder?: number;
  flightNumber?: number;
  rankingStage?: string;
};

type GetAwardProfileArgs = {
  awardProfiles: AwardProfile[];
  participation?: AwardProfileParticipation;
  wheelchairClass?: string;
  eventType?: EventTypeUnion;
  startDate?: string;
  endDate?: string;
  drawSize?: number;
  drawType?: string;
  category?: Category;
  gender?: string;
  level?: number;
};

/**
 * `values.includes(value)` where the value may be absent.
 *
 * An absent value never matches, which is the long-standing behaviour: a profile
 * that declares a filter does not match an event that lacks the field at all.
 * Written as a helper rather than inline so the undefined case stays explicit —
 * the obvious type-safe rewrite (`value !== undefined && !values.includes(value)`
 * folded into the caller's negation) silently inverts it.
 */
function includesValue<T>(values: readonly T[], value: T | undefined): boolean {
  return value !== undefined && values.includes(value);
}

export function getAwardProfile({
  participation = {},
  awardProfiles,
  wheelchairClass,
  startDate,
  eventType,
  drawSize,
  drawType,
  category,
  endDate,
  gender,
  level,
}: GetAwardProfileArgs): { awardProfile: AwardProfile | undefined } {
  const { participationOrder, flightNumber, rankingStage } = participation;

  const isValidDateRange = (profile: AwardProfile): boolean => {
    if ((!startDate && !endDate) || !profile.dateRanges) return true;
    return profile.dateRanges.some((dateRange: DateRange) => {
      const validStartDate = !startDate || !dateRange.startDate || new Date(startDate) > new Date(dateRange.startDate);
      const validEndDate = !endDate || !dateRange.endDate || new Date(endDate) <= new Date(dateRange.endDate);
      return validStartDate && validEndDate;
    });
  };

  const matchesCategory = (profileCategory: CategoryScope | undefined): boolean => {
    if (!profileCategory) return true;
    const c: Category = category ?? {};

    // Each populated CategoryScope field must match (AND logic)
    // Within each array, any value suffices (OR logic)
    if (profileCategory.ageCategoryCodes?.length && !includesValue(profileCategory.ageCategoryCodes, c.ageCategoryCode))
      return false;
    if (profileCategory.genders?.length && !includesValue(profileCategory.genders, gender)) return false;
    if (profileCategory.categoryNames?.length && !includesValue(profileCategory.categoryNames, c.categoryName))
      return false;
    if (profileCategory.categoryTypes?.length && !includesValue(profileCategory.categoryTypes, c.type)) return false;
    if (profileCategory.ratingTypes?.length && !includesValue(profileCategory.ratingTypes, c.ratingType)) return false;
    if (profileCategory.ballTypes?.length && !includesValue(profileCategory.ballTypes, c.ballType)) return false;
    if (profileCategory.wheelchairClasses?.length && !includesValue(profileCategory.wheelchairClasses, wheelchairClass))
      return false;
    if (profileCategory.subTypes?.length && !includesValue(profileCategory.subTypes, c.subType)) return false;

    return true;
  };

  const matchesProfile = (profile: AwardProfile): boolean =>
    isValidDateRange(profile) &&
    (!profile.maxFlightNumber || (flightNumber !== undefined && flightNumber <= profile.maxFlightNumber)) &&
    (!profile.drawTypes?.length || includesValue(profile.drawTypes, drawType)) &&
    (!profile.drawSizes?.length || includesValue(profile.drawSizes, drawSize)) &&
    (!profile.stages?.length || includesValue(profile.stages, rankingStage)) &&
    (!profile.levels?.length || includesValue(profile.levels, level)) &&
    (!profile.maxDrawSize || (drawSize !== undefined && drawSize <= profile.maxDrawSize)) &&
    (!profile.drawSize || profile.drawSize === drawSize) &&
    (!profile.maxLevel || (level !== undefined && level <= profile.maxLevel)) &&
    (!flightNumber ||
      !profile.flights?.flightNumbers?.length ||
      profile.flights.flightNumbers.includes(flightNumber)) &&
    (!profile.participationOrder || profile.participationOrder === participationOrder) &&
    matchesCategory(profile.category) &&
    (!profile.eventTypes?.length || includesValue(profile.eventTypes, eventType));

  // Collect all matching profiles
  const matchingProfiles = awardProfiles.filter(matchesProfile);

  if (matchingProfiles.length === 0) return { awardProfile: undefined };
  if (matchingProfiles.length === 1) return { awardProfile: matchingProfiles[0] };

  // If any matching profile has an explicit priority, the highest priority wins
  const withPriority = matchingProfiles.filter(
    (p): p is AwardProfile & { priority: number } => p.priority !== undefined,
  );
  if (withPriority.length) {
    const maxPriority = Math.max(...withPriority.map((p) => p.priority));
    const awardProfile = withPriority.find((p) => p.priority === maxPriority);
    return { awardProfile };
  }

  // Specificity scoring: count how many scope fields are populated
  const scored = matchingProfiles.map((profile, index) => ({
    profile,
    score: getSpecificityScore(profile),
    index,
  }));

  // Sort by score descending, then by original array order (first wins ties)
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return { awardProfile: scored[0].profile };
}

/**
 * Calculate specificity score for an award profile.
 * Each populated scope field adds 1 point.
 * Each populated CategoryScope sub-field adds 1 additional point.
 */
function getSpecificityScore(profile: AwardProfile): number {
  let score = 0;

  // Score profile-level scope fields
  for (const field of PROFILE_SCOPE_FIELDS) {
    const value = profile[field];
    if (value !== undefined && value !== null) {
      // Arrays must be non-empty to count
      if (Array.isArray(value) && value.length === 0) continue;
      score += 1;
    }
  }

  // Score category sub-fields
  if (profile.category) {
    for (const field of CATEGORY_SCOPE_FIELDS) {
      const value = profile.category[field];
      if (Array.isArray(value) && value.length > 0) {
        score += 1;
      }
    }
  }

  return score;
}
