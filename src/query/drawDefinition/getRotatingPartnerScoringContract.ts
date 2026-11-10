import { normalizeRotatingPartnerScoreContract } from '@Helpers/rotatingPartners/scoringContract';
import { isCompetitionProfile } from '@Validators/competitionProfile';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { RotatingPartnerScoreContractWithTimed } from '@Types/rotatingPartnerScoring';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/** Historical scoring is derived from the saved choice, never today's inherited policy. */
export function getRotatingPartnerScoringContract({
  drawDefinition,
}: {
  drawDefinition?: DrawDefinition;
}): ResultType & { contract?: RotatingPartnerScoreContractWithTimed } {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const profile = drawDefinition.competitionProfile;
  if (!isCompetitionProfile(profile) || profile.format === 'LADDER' || !profile.scoring.selectedVariant)
    return { error: INVALID_VALUES, info: 'rotating-partner scoring has not been configured' };
  const { selectedVariant, ...configuration } = profile.scoring;
  const contract = normalizeRotatingPartnerScoreContract({ ...configuration, ...selectedVariant });
  return contract ? { ...SUCCESS, contract } : { error: INVALID_VALUES, info: 'invalid saved scoring contract' };
}
