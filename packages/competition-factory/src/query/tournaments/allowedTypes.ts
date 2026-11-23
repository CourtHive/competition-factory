import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// constants
import { POLICY_TYPE_SCORING, POLICY_TYPE_DRAWS } from '@Constants/policyConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

export function getAllowedMatchUpFormats({ tournamentRecord, categoryName, categoryType }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord });
  const scoringPolicy = appliedPolicies?.[POLICY_TYPE_SCORING];
  const matchUpFormats = scoringPolicy?.matchUpFormats ?? [];
  return matchUpFormats.filter(
    ({ categoryNames, categoryTypes }) =>
      (!categoryName && !categoryTypes) ||
      (categoryName && categoryNames?.includes(categoryName)) ||
      (categoryType && categoryTypes?.includes(categoryType)),
  );
}

export function getAllowedDrawTypes({ tournamentRecord, categoryName, categoryType }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord });
  const drawTypesPolicy = appliedPolicies?.[POLICY_TYPE_DRAWS];
  const drawTypes = drawTypesPolicy?.allowedDrawTypes ?? [];
  return drawTypes.filter(
    ({ categoryNames, categoryTypes }) =>
      (!categoryName && !categoryTypes) ||
      (categoryName && categoryNames?.includes(categoryName)) ||
      (categoryType && categoryTypes?.includes(categoryType)),
  );
}
