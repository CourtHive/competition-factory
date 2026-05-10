import { getBand, getScoreComponents, pctSpread } from './scoreComponents';
import { resolveCompetitiveBands } from './resolveCompetitiveBands';

import { MatchUp, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ErrorType, INVALID_VALUES, MISSING_MATCHUP } from '@Constants/errorConditionConstants';

type GetMatchUpCompetitivenessArgs = {
  tournamentRecord?: Tournament;
  profileBands?: any;
  matchUp: MatchUp;
};

export function getMatchUpCompetitiveProfile({
  tournamentRecord,
  profileBands,
  matchUp,
}: GetMatchUpCompetitivenessArgs): {
  competitiveness?: any;
  pctSpread?: number;
  success?: boolean;
  error?: ErrorType;
} {
  if (!matchUp) return { error: MISSING_MATCHUP };
  const { score, winningSide } = matchUp;

  if (!winningSide) return { error: INVALID_VALUES };

  const bandProfiles = profileBands || resolveCompetitiveBands({ tournamentRecord });

  const scoreComponents = getScoreComponents({ score });
  const spread = pctSpread([scoreComponents]);
  const competitiveness = getBand(spread, bandProfiles);
  const pctSpreadValue = Array.isArray(spread) ? spread[0] : spread;

  return { ...SUCCESS, competitiveness, pctSpread: pctSpreadValue };
}
