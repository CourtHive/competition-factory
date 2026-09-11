import { resolveScaleValueNumber, hasScaleValueNumber } from './resolveScaleValue';
import { getDetailsWTN } from './getDetailsWTN';

import { WTN } from '@Constants/ratingConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type GetAvgWTNArgs = {
  matchUps: HydratedMatchUp[];
  eventType?: string;
  eventId?: string;
  drawId: string;
};
export function getAvgWTN({ eventType, matchUps, eventId, drawId }: GetAvgWTNArgs) {
  const matchUpFormatCounts = {};

  const countMatchUpFormat = (params) => {
    const matchUpFormat = params?.matchUpFormat;
    if (!matchUpFormat) return;
    if (!matchUpFormatCounts[matchUpFormat]) matchUpFormatCounts[matchUpFormat] = 0;
    matchUpFormatCounts[matchUpFormat] += 1;
  };
  const mappedParticipants = matchUps
    .filter((matchUp) => (eventId ? matchUp.eventId === eventId : matchUp.drawId === drawId))
    .reduce((participants, matchUp) => {
      countMatchUpFormat(matchUp);
      (matchUp.sides ?? [])
        .flatMap((side: any) => (side?.participant?.individualParticipants || [side?.participant]).filter(Boolean))
        .forEach((participant) => (participants[participant.participantId] = participant));
      return participants;
    }, {});
  const eventParticipants = Object.values(mappedParticipants);
  // `getDetailsWTN` returns the value exactly as stored, which for ingested
  // records is a STRING. Accumulating those with `+=` concatenates instead of
  // adding ('0' + '4.13' + '5.20' -> '04.135.20'), so avgWTN came out NaN for
  // any field of two or more rated players — and that NaN reaches published
  // structure reports via structureReport.ts. Normalize once, here.
  const wtnRatings = eventParticipants
    .map((participant) => getDetailsWTN({ participant, eventType }))
    .filter(({ wtnRating }) => hasScaleValueNumber(wtnRating, { scaleName: WTN }));

  const pctNoRating = ((eventParticipants.length - wtnRatings.length) / eventParticipants.length) * 100;

  const wtnTotals = wtnRatings.reduce(
    (totals, wtnDetails) => {
      const { wtnRating, confidence } = wtnDetails;
      totals.totalWTN += resolveScaleValueNumber(wtnRating, { scaleName: WTN }) ?? 0;
      totals.totalConfidence += resolveScaleValueNumber(confidence) ?? 0;
      return totals;
    },
    { totalWTN: 0, totalConfidence: 0 },
  );
  const avgWTN = wtnRatings?.length ? wtnTotals.totalWTN / wtnRatings.length : 0;
  const avgConfidence = wtnRatings?.length ? wtnTotals.totalConfidence / wtnRatings.length : 0;

  const counts: number[] = Object.values(matchUpFormatCounts);
  const matchUpsCount = counts.reduce((p: number, c) => {
    return p + (c || 0);
  }, 0);

  return {
    matchUpFormatCounts,
    matchUpsCount,
    avgConfidence,
    pctNoRating,
    avgWTN,
  };
}
