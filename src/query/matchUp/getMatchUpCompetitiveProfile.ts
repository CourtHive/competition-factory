import { resolveCompetitiveBands, resolveDeltaBands } from './resolveCompetitiveBands';
import { getBand, getScoreComponents, pctSpread } from './scoreComponents';
import { DeltaBand, resolveDeltaBand } from './resolveDeltaBand';
import { getMatchUpRatingDelta } from './getMatchUpRatingDelta';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { MatchUp, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type GetMatchUpCompetitivenessArgs = {
  policyDefinitions?: PolicyDefinitions;
  singlesForDoubles?: boolean;
  tournamentRecord?: Tournament;
  deltaBands?: DeltaBand[];
  scaleAccessor?: string;
  participantId?: string;
  sideNumber?: number;
  ascending?: boolean;
  scaleName?: string;
  profileBands?: any;
  matchUp: MatchUp;
};

/**
 * Bands a completed matchUp on both competitive axes.
 *
 * REALIZED (always): `competitiveness` + `pctSpread` from the score spread —
 * unsigned, 0-100, three policy thresholds.
 *
 * SIGNED EXPOSURE (opt-in): `signedDelta` + `deltaBand` from the two sides'
 * rating delta — signed, unbounded, N policy boundaries. Engages ONLY when
 * `scaleName` is supplied, which is also what makes this change invisible to
 * every existing caller: without it the returned object is unchanged.
 */
export function getMatchUpCompetitiveProfile({
  singlesForDoubles,
  policyDefinitions,
  tournamentRecord,
  scaleAccessor,
  participantId,
  profileBands,
  deltaBands,
  sideNumber,
  ascending,
  scaleName,
  matchUp,
}: GetMatchUpCompetitivenessArgs): {
  perspectiveSideNumber?: number;
  competitiveness?: any;
  signedDelta?: number;
  deltaBand?: string;
  pctSpread?: number;
  success?: boolean;
  error?: ErrorType;
  info?: string;
} {
  if (!matchUp) return { error: MISSING_MATCHUP };
  const { score, winningSide } = matchUp;

  if (!winningSide) return { error: INVALID_VALUES };

  const bandProfiles = profileBands || resolveCompetitiveBands({ policyDefinitions, tournamentRecord });

  const scoreComponents = getScoreComponents({ score });
  const spread = pctSpread([scoreComponents]);
  const competitiveness = getBand(spread, bandProfiles);
  const pctSpreadValue = Array.isArray(spread) ? spread[0] : spread;

  const realized = { ...SUCCESS, competitiveness, pctSpread: pctSpreadValue };

  if (!scaleName) return realized;

  const { perspectiveSideNumber, signedDelta, error, info } = getMatchUpRatingDelta({
    singlesForDoubles,
    scaleAccessor,
    participantId,
    sideNumber,
    ascending,
    scaleName,
    matchUp,
  });
  // An unresolvable orientation is a caller configuration error, surfaced
  // rather than folded into a partial result.
  if (error) return { error, info };
  if (signedDelta === undefined) return { ...realized, perspectiveSideNumber };

  const bands = deltaBands ?? resolveDeltaBands({ policyDefinitions, tournamentRecord });
  // No deltaBands in policy: the delta, and no band. Never a guessed default.
  if (!bands) return { ...realized, perspectiveSideNumber, signedDelta };

  const bandResult = resolveDeltaBand(signedDelta, bands, scaleName);
  if (bandResult.error) return { error: bandResult.error, info: bandResult.info };

  return { ...realized, perspectiveSideNumber, signedDelta, deltaBand: bandResult.band };
}
