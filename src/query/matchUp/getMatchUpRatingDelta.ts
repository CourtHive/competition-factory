import { resolveScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { signedRatingDelta } from './resolveDeltaBand';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';

// constants and types
import { ErrorType } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/matchUpTypes';

export type MatchUpRatingDelta = {
  perspectiveSideNumber?: number;
  signedDelta?: number;
  ownRating?: number;
  oppRating?: number;
  error?: ErrorType;
  info?: string;
};

type GetMatchUpRatingDeltaArgs = {
  singlesForDoubles?: boolean;
  scaleAccessor?: string;
  participantId?: string;
  sideNumber?: number;
  ascending?: boolean;
  scaleName?: string;
  matchUp: any;
};

function participantIds(participant: any): string[] {
  if (!participant) return [];
  const individualIds = (participant.individualParticipants ?? [])
    .map((individual: any) => individual?.participantId)
    .filter(Boolean);
  return participant.participantId ? [participant.participantId, ...individualIds] : individualIds;
}

function scaleValueForParticipant({
  valueAccessor,
  participant,
  scaleName,
  type,
}: {
  valueAccessor?: string;
  participant: any;
  scaleName?: string;
  type: string;
}): number | undefined {
  // Mirrors getPredictiveAccuracy's resolution order: a rating wins over a
  // ranking of the same scaleName.
  const rating = participant?.ratings?.[type]?.find((entry: any) => entry.scaleName === scaleName);
  const ranking = participant?.rankings?.[type]?.find((entry: any) => entry.scaleName === scaleName);
  const scaleValue = (rating ?? ranking)?.scaleValue;
  // A `typeof === 'number'` gate here rejected every ingested rating, which are
  // stored as strings, and the caller treats `undefined` as "missing data, not a
  // caller mistake" — so a fully rated draw reported no deltas and raised nothing.
  return resolveScaleValueNumber(scaleValue, { accessor: valueAccessor, scaleName });
}

/**
 * A side's rating on `scaleName`.
 *
 * For a pair, the MEAN of the individual ratings — not the sum. The delta these
 * feed is banded against boundaries expressed in single-player rating units (or
 * a percentage of the scale's range), so a summed pair delta would be
 * systematically ~2x and land in the wrong band. (`getPredictiveAccuracy` sums
 * and compensates with `zoneDoubling`; that only works because its margin is a
 * single scalar rather than a band ladder.) A pair with any unrated individual
 * is unrated: averaging over the rated subset would understate the delta.
 */
function sideRating({
  valueAccessor,
  scaleName,
  side,
  type,
}: {
  valueAccessor?: string;
  scaleName?: string;
  side: any;
  type: string;
}): number | undefined {
  const participant = side?.participant;
  const individuals = participant?.individualParticipants;

  if (Array.isArray(individuals) && individuals.length) {
    const values = individuals.map((individual: any) =>
      scaleValueForParticipant({ participant: individual, valueAccessor, scaleName, type }),
    );
    if (values.some((value) => value === undefined)) return undefined;
    return (values as number[]).reduce((total, value) => total + value, 0) / values.length;
  }

  return scaleValueForParticipant({ participant, valueAccessor, scaleName, type });
}

function perspectiveIndex({
  participantId,
  sideNumber,
  sides,
}: {
  participantId?: string;
  sideNumber?: number;
  sides: any[];
}): number | undefined {
  if (sideNumber === 1 || sideNumber === 2) return sideNumber - 1;
  if (participantId) {
    const index = sides.findIndex((side) => participantIds(side?.participant).includes(participantId));
    return index === -1 ? undefined : index;
  }
  // No perspective given: side 1, reported back as `perspectiveSideNumber` so
  // the caller can see which way the sign points.
  return 0;
}

/**
 * The signed rating delta of a matchUp from one side's perspective — positive
 * means the opponent was stronger (playing up).
 *
 * A matchUp whose sides are not hydrated with participants, or where either
 * side has no value on `scaleName`, yields no `signedDelta` and NO error: an
 * absent rating is missing data, not a caller mistake. A caller that asked for
 * the signed axis against a scale of unknown orientation DOES get an error.
 */
export function getMatchUpRatingDelta({
  singlesForDoubles,
  scaleAccessor,
  participantId,
  sideNumber,
  ascending,
  scaleName,
  matchUp,
}: GetMatchUpRatingDeltaArgs): MatchUpRatingDelta {
  const sides = matchUp?.sides;
  if (!Array.isArray(sides) || sides.length !== 2) return {};

  const index = perspectiveIndex({ participantId, sideNumber, sides });
  if (index === undefined) return {};

  const type = singlesForDoubles ? SINGLES : (matchUp.matchUpType ?? SINGLES);
  const valueAccessor = scaleAccessor ?? (scaleName ? ratingsParameters[scaleName]?.accessor : undefined);

  const ownRating = sideRating({ side: sides[index], valueAccessor, scaleName, type });
  const oppRating = sideRating({ side: sides[1 - index], valueAccessor, scaleName, type });
  const perspectiveSideNumber = index + 1;

  if (ownRating === undefined || oppRating === undefined) return { perspectiveSideNumber };

  const { signedDelta, error, info } = signedRatingDelta({ ownRating, oppRating, ascending, scaleName });
  if (error) return { error, info };

  return { perspectiveSideNumber, signedDelta, ownRating, oppRating };
}
