import { decorateResult } from '@Functions/global/decorateResult';
import { isConvertableInteger, isPowerOf2 } from '@Tools/math';
import { feedInMatchUps } from './feedInMatchUps';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_DRAW_SIZE } from '@Constants/errorConditionConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/**
 * A FEED_IN (staggered entry) qualifying structure of `drawSize` positions produces `qualifyingPositions`
 * qualifiers exactly when they divide the draw size at least twice over. Its shape is `drawSize / qualifyingPositions`
 * in binary, scaled by `qualifyingPositions`: the highest bit is the base draw and every lower bit is a fed round,
 * so the final qualifying round is never earlier than the last fed round.
 *
 * - 12 → 4: 8 in round 1, 4 fed into round 2
 * - 13 → 1 only: 8 in round 1, 4 fed into round 2, 1 fed into round 5
 * - 10 → 5: one round of 5 matchUps
 * - 15 → 5: 10 in round 1, 5 fed into round 2
 */
export function getFeedInQualifyingPositions({ drawSize }: { drawSize?: number }): { qualifyingPositions: number[] } {
  if (!isConvertableInteger(drawSize) || (drawSize as number) < 2) return { qualifyingPositions: [] };
  const size = Number(drawSize);
  const qualifyingPositions: number[] = [];
  for (let qualifiers = 1; qualifiers <= size / 2; qualifiers++) {
    if (!(size % qualifiers)) qualifyingPositions.push(qualifiers);
  }
  return { qualifyingPositions };
}

/** the number of rounds played before `qualifyingPositions` qualifiers remain: base rounds plus one per fed round */
function getRoundsCount({ drawSize, qualifyingPositions }: { drawSize: number; qualifyingPositions: number }) {
  const multiple = drawSize / qualifyingPositions;
  const top = largestPowerOf2AtMost(multiple);
  const fedRoundsCount = [...(multiple - top).toString(2)].filter((bit) => bit === '1').length;
  return Math.log2(top) + fedRoundsCount;
}

function largestPowerOf2AtMost(value: number) {
  let power = 1;
  while (power * 2 <= value) power *= 2;
  return power;
}

type FeedInQualifyingMatchUpsArgs = {
  qualifyingRoundNumber?: number;
  qualifyingPositions?: number;
  matchUpType?: string;
  drawSize?: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
};

/**
 * Generates the matchUps of a FEED_IN qualifying structure. `qualifyingPositions` names the qualifiers; without it,
 * `qualifyingRoundNumber` selects the round of the full FEED_IN structure of `drawSize` at which qualifying stops,
 * which must be at or after its last fed round.
 */
export function feedInQualifyingMatchUps(params: FeedInQualifyingMatchUpsArgs): {
  qualifyingPositions?: number;
  matchUps?: MatchUp[];
  roundLimit?: number;
  drawSize?: number;
  error?: ErrorType;
} {
  const stack = 'feedInQualifyingMatchUps';
  const { qualifyingRoundNumber, matchUpType, idPrefix, isMock, uuids } = params;
  if (!isConvertableInteger(params.drawSize)) return decorateResult({ result: { error: MISSING_DRAW_SIZE }, stack });
  const drawSize = Number(params.drawSize);

  const { qualifyingPositions: validPositions } = getFeedInQualifyingPositions({ drawSize });
  // without an explicit count, the round number selects among the qualifier counts of the full FEED_IN structure
  const qualifyingPositions =
    params.qualifyingPositions ??
    validPositions.find(
      (qualifiers) =>
        isPowerOf2(qualifiers) &&
        getRoundsCount({ drawSize, qualifyingPositions: qualifiers }) === qualifyingRoundNumber,
    );

  if (!qualifyingPositions || !validPositions.includes(qualifyingPositions)) {
    return decorateResult({
      context: { drawSize, qualifyingPositions, qualifyingRoundNumber, validQualifyingPositions: validPositions },
      info: 'qualifyingPositions must divide drawSize at least twice over',
      result: { error: INVALID_VALUES },
      stack,
    });
  }

  const baseDrawSize = qualifyingPositions * largestPowerOf2AtMost(drawSize / qualifyingPositions);
  const { matchUps } = feedInMatchUps({
    qualifyingPositions,
    baseDrawSize,
    matchUpType,
    drawSize,
    idPrefix,
    isMock,
    uuids,
  });
  const roundLimit = getRoundsCount({ drawSize, qualifyingPositions });

  return { drawSize, matchUps, roundLimit, qualifyingPositions };
}
