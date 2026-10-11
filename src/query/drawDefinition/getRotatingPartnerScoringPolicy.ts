import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  isRotatingPartnerScoringPolicy,
  isRotatingPartnerScoringVariant,
  sameScoringVariant,
} from '@Validators/rotatingPartnerScoringPolicy';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type {
  RotatingPartnerScoreContract,
  RotatingPartnerScoringPolicy,
  RotatingPartnerScoringVariant,
} from '@Types/rotatingPartnerScoring';

const defaultPolicy: RotatingPartnerScoringPolicy = {
  defaultVariant: { tieResolution: 'ALLOW' },
  permittedVariants: [
    { tieResolution: 'ALLOW' },
    { tieResolution: 'DECIDING_POINT' },
    { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 },
  ],
};

/** Resolved whole-policy precedence is shared with all other factory policy queries. */
export function getRotatingPartnerScoringPolicy(params: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  event?: Event;
  selectedVariant?: RotatingPartnerScoringVariant;
}): ResultType & {
  scoringPolicy?: RotatingPartnerScoringPolicy;
  contract?: RotatingPartnerScoreContract;
  selectionLocked?: boolean;
} {
  const profile = params.drawDefinition?.competitionProfile;
  if (!params.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!profile || profile.format === 'LADDER') return { error: INVALID_VALUES };
  const { appliedPolicies } = getAppliedPolicies(params);
  const scoring = appliedPolicies?.[POLICY_TYPE_SCORING];
  const section: unknown = scoring?.rotatingPartners;
  if (scoring && Object.hasOwn(scoring, 'rotatingPartners') && section === undefined)
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy section' };
  if (section !== undefined && (!section || typeof section !== 'object' || Array.isArray(section)))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy section' };
  const configured: unknown = section === undefined ? undefined : (section as Record<string, unknown>)[profile.format];
  const hasConfigured = section !== undefined && Object.hasOwn(section, profile.format);
  const scoringPolicy = hasConfigured ? configured : defaultPolicy;
  if (!isRotatingPartnerScoringPolicy(scoringPolicy))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy' };
  const selectedVariant = params.selectedVariant ?? profile.scoring.selectedVariant ?? scoringPolicy.defaultVariant;
  if (
    !isRotatingPartnerScoringVariant(selectedVariant) ||
    !scoringPolicy.permittedVariants.some((variant) => sameScoringVariant(variant, selectedVariant))
  )
    return { error: INVALID_VALUES, info: 'scoring variant is not permitted' };
  const { combinedPointTotal } = profile.scoring;
  if (
    !Number.isSafeInteger(combinedPointTotal) ||
    combinedPointTotal <= 0 ||
    (scoringPolicy.permittedPointTotals && !new Set(scoringPolicy.permittedPointTotals).has(combinedPointTotal))
  )
    return { error: INVALID_VALUES, info: 'combined point total is not permitted' };
  return {
    ...SUCCESS,
    scoringPolicy: makeDeepCopy(scoringPolicy, undefined, true),
    contract: { combinedPointTotal, ...selectedVariant },
    selectionLocked: scoringPolicy.permittedVariants.length === 1,
  };
}
