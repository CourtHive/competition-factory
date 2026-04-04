import { CATEGORY_SCOPE_FIELDS, PROFILE_SCOPE_FIELDS } from '@Constants/rankingConstants';

import type { CategoryScope } from '@Types/rankingTypes';

export function getAwardProfile(params) {
  const {
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
  } = params;
  const { participationOrder, flightNumber, rankingStage } = participation;

  const isValidDateRange = (profile) => {
    if ((!startDate && !endDate) || !profile.dateRanges) return true;
    return profile.dateRanges.some((dateRange) => {
      const validStartDate = !startDate || !dateRange.startDate || new Date(startDate) > new Date(dateRange.startDate);
      const validEndDate = !endDate || !dateRange.endDate || new Date(endDate) <= new Date(dateRange.endDate);
      return validStartDate && validEndDate;
    });
  };

  const matchesCategory = (profileCategory: CategoryScope | undefined) => {
    if (!profileCategory) return true;
    const c = category ?? {};

    // Each populated CategoryScope field must match (AND logic)
    // Within each array, any value suffices (OR logic)
    if (profileCategory.ageCategoryCodes?.length && !profileCategory.ageCategoryCodes.includes(c.ageCategoryCode))
      return false;
    if (profileCategory.genders?.length && !profileCategory.genders.includes(gender)) return false;
    if (profileCategory.categoryNames?.length && !profileCategory.categoryNames.includes(c.categoryName)) return false;
    if (profileCategory.categoryTypes?.length && !profileCategory.categoryTypes.includes(c.type)) return false;
    if (profileCategory.ratingTypes?.length && !profileCategory.ratingTypes.includes(c.ratingType)) return false;
    if (profileCategory.ballTypes?.length && !profileCategory.ballTypes.includes(c.ballType)) return false;
    if (profileCategory.wheelchairClasses?.length && !profileCategory.wheelchairClasses.includes(wheelchairClass))
      return false;
    if (profileCategory.subTypes?.length && !profileCategory.subTypes.includes(c.subType)) return false;

    return true;
  };

  const matchesProfile = (profile) =>
    isValidDateRange(profile) &&
    (!profile.maxFlightNumber || flightNumber <= profile.maxFlightNumber) &&
    (!profile.drawTypes?.length || profile.drawTypes?.includes(drawType)) &&
    (!profile.drawSizes?.length || profile.drawSizes.includes(drawSize)) &&
    (!profile.stages?.length || profile.stages.includes(rankingStage)) &&
    (!profile.levels?.length || profile.levels.includes(level)) &&
    (!profile.maxDrawSize || drawSize <= profile.maxDrawSize) &&
    (!profile.drawSize || profile.drawSize === drawSize) &&
    (!profile.maxLevel || level <= profile.maxLevel) &&
    (!flightNumber ||
      !profile.flights?.flightNumbers?.length ||
      profile.flights.flightNumbers.includes(flightNumber)) &&
    (!profile.participationOrder || profile.participationOrder === participationOrder) &&
    matchesCategory(profile.category) &&
    (!profile.eventTypes?.length || profile.eventTypes?.includes(eventType));

  // Collect all matching profiles
  const matchingProfiles = awardProfiles.filter(matchesProfile);

  if (matchingProfiles.length === 0) return { awardProfile: undefined };
  if (matchingProfiles.length === 1) return { awardProfile: matchingProfiles[0] };

  // If any matching profile has an explicit priority, the highest priority wins
  const withPriority = matchingProfiles.filter((p) => p.priority !== undefined);
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
function getSpecificityScore(profile): number {
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
