import { isCompetitionProfile } from '@Validators/competitionProfile';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/** Historical scoring is derived from the saved choice, never today's inherited policy. */
export function getRotatingPartnerScoringContract({
  drawDefinition,
}: {
  drawDefinition?: DrawDefinition;
}): ResultType & { contract?: RotatingPartnerScoreContract } {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const profile = drawDefinition.competitionProfile;
  if (!isCompetitionProfile(profile) || profile.format === 'LADDER' || !profile.scoring.selectedVariant)
    return { error: INVALID_VALUES, info: 'rotating-partner scoring has not been configured' };
  return {
    ...SUCCESS,
    contract: { combinedPointTotal: profile.scoring.combinedPointTotal, ...profile.scoring.selectedVariant },
  };
}
