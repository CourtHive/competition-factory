import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { chunkArray, generateRange, intersection } from '@Tools/arrays';
import { definedAttributes } from '@Tools/definedAttributes';
import { validMatchUps } from '@Validators/validMatchUp';
import { numericSort } from '@Tools/sorting';
import { ensureInt } from '@Tools/ensureInt';
import { isPowerOf2 } from '@Tools/math';

// Constants and Types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUp } from '@Types/tournamentTypes';
import { RoundProfile } from '@Types/factoryTypes';
import { TEAM } from '@Constants/matchUpTypes';

type GetRoundMatchUpsArgs = {
  // Accepts either base `MatchUp` (e.g. drafted but not yet hydrated) or
  // `HydratedMatchUp` — the function only inspects base fields
  // (`roundNumber`, `matchUpType`, `roundPosition`, `roundName`,
  // `finishingRound`, `abbreviatedRoundName`) so the looser type is
  // honest about what's required.
  matchUps?: MatchUp[];
  interpolate?: boolean;
};

export type RoundMatchUpsResult = {
  roundMatchUps?: { [roundNumber: number]: HydratedMatchUp[] };
  hasNoRoundPositions?: boolean;
  roundsNotPowerOf2?: boolean;
  maxMatchUpsCount?: number;
  roundProfile?: RoundProfile;
  roundNumbers?: number[];
  error?: ErrorType;
};

function findDrawPositionInChunk(chunk: any[], filteredDrawPositions: any[]) {
  return filteredDrawPositions?.find((drawPosition) => chunk.includes(drawPosition));
}

export function getRoundMatchUps({ matchUps = [], interpolate }: GetRoundMatchUpsArgs): RoundMatchUpsResult {
  if (!validMatchUps(matchUps)) return { roundMatchUps: [], error: INVALID_VALUES };

  // create an array of arrays of matchUps grouped by roundNumber
  const roundMatchUpsArray = matchUps
    .reduce((roundNumbers: number[], matchUp) => {
      const roundNumber =
        typeof matchUp.roundNumber === 'string' ? ensureInt(matchUp.roundNumber) : (matchUp.roundNumber as number);
      return !matchUp.roundNumber || roundNumbers.includes(roundNumber)
        ? roundNumbers
        : roundNumbers.concat(roundNumber);
    }, [])
    .sort(numericSort)
    .map((roundNumber) => {
      const roundMatchUps = matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber);
      const hasTeamMatchUps = roundMatchUps.find(({ matchUpType }) => matchUpType === TEAM);
      // if there are TEAM matchUps then all other matchUpTypes must be removed
      const consideredMatchUps = hasTeamMatchUps
        ? roundMatchUps.filter(({ matchUpType }) => matchUpType === TEAM)
        : roundMatchUps;
      const getSorted = (items) => items.toSorted((a, b) => numericSort(a.roundPosition, b.roundPosition));
      return {
        [roundNumber]: getSorted(consideredMatchUps),
      };
    });

  // calculate the finishing Round for each roundNumber
  const finishingRoundMap = matchUps.reduce((mapping, matchUp) => {
    const roundNumber =
      typeof matchUp.roundNumber === 'string' ? ensureInt(matchUp.roundNumber) : (matchUp.roundNumber as number);
    if (!mapping[roundNumber])
      mapping[roundNumber] = definedAttributes({
        // `abbreviatedRoundName` lives on HydratedMatchUp (added by
        // `addMatchUpContext`), not on base MatchUp. Tolerated as
        // `undefined` when the input wasn't hydrated.
        abbreviatedRoundName: (matchUp as HydratedMatchUp).abbreviatedRoundName,
        finishingRound: matchUp.finishingRound,
        roundName: matchUp.roundName,
      });
    return mapping;
  }, {});

  // convert roundMatchUpsArray into an object with roundNumber keys
  const roundMatchUps = Object.assign({}, ...roundMatchUpsArray);

  if (interpolate) {
    const maxRoundNumber = Math.max(
      ...Object.keys(roundMatchUps)
        .map((key) => ensureInt(key))
        .filter((f) => !Number.isNaN(f)),
    );
    const maxRoundMatchUpsCount = roundMatchUps[maxRoundNumber]?.length;
    // when considering a structue, if rounds do not progress to a final round which contains one matchUp
    // and if the last provided round has power-of-two matchUpsCount, add details for the matchUps which are "missing"
    if (maxRoundMatchUpsCount > 1 && isPowerOf2(maxRoundMatchUpsCount)) {
      const nextRound = maxRoundNumber + 1;
      const lastRound = nextRound + maxRoundMatchUpsCount / 2;
      const roundsToInterpolate = generateRange(nextRound, lastRound);
      roundsToInterpolate.forEach((roundNumber, i) => {
        roundMatchUps[roundNumber] = generateRange(0, maxRoundMatchUpsCount / (2 + i * 2)).map(() => ({})); // add dummy objects for padding out the array
      });
    }
  }

  let maxMatchUpsCount = 0;

  // create a profle object with roundNubmer keys
  // provides details for each round, including:
  //  - matchUpsCount: total number of matchUps
  //  - preFeedRound: whether the round is followed by a feedRound
  //  - feedRound: whether round matchUps have fed partitipants
  //  - roundIndex & feedRoundIndex: index relative to round type
  //  - finishingRound: reverse count of rounds. Final is finishingRound #1
  const roundProfile: RoundProfile = Object.assign(
    {},
    ...Object.keys(roundMatchUps).map((roundNumber) => {
      const matchUpsCount = roundMatchUps[roundNumber]?.length;
      const inactiveCount = roundMatchUps[roundNumber]?.filter(
        (matchUp) => !completedMatchUpStatuses.includes(matchUp.matchUpStatus) && !matchUp.score?.scoreStringSide1,
      )?.length;
      const inactiveRound = matchUpsCount && matchUpsCount === inactiveCount;

      maxMatchUpsCount = Math.max(maxMatchUpsCount, matchUpsCount);
      return { [roundNumber]: { matchUpsCount, inactiveCount, inactiveRound } };
    }),
  );

  let roundIndex = 0;
  let feedRoundIndex = 0;
  const roundNumbers = Object.keys(roundMatchUps)
    .map((key) => ensureInt(key))
    .filter((f) => !Number.isNaN(f));
  roundNumbers.forEach((roundNumber) => {
    const currentRoundMatchUps = roundMatchUps[roundNumber].sort((a, b) => a.roundPosition - b.roundPosition);
    const currentRoundDrawPositions = currentRoundMatchUps.flatMap((matchUp) => matchUp?.drawPositions ?? []);

    roundProfile[roundNumber].roundNumber = roundNumber; // convenience

    // convenience for display calculations
    roundProfile[roundNumber].roundFactor = roundProfile[roundNumber].matchUpsCount
      ? maxMatchUpsCount / roundProfile[roundNumber].matchUpsCount
      : 1;

    roundProfile[roundNumber].finishingRound = finishingRoundMap[roundNumber]?.finishingRound;
    roundProfile[roundNumber].roundName = finishingRoundMap[roundNumber]?.roundName;
    roundProfile[roundNumber].abbreviatedRoundName = finishingRoundMap[roundNumber]?.abbreviatedRoundName;

    roundProfile[roundNumber].finishingPositionRange = roundMatchUps[roundNumber]?.[0]?.finishingPositionRange;

    if (roundNumber === 1 || !roundProfile[roundNumber - 1]) {
      const orderedDrawPositions = currentRoundDrawPositions.toSorted(numericSort);
      const pairedDrawPositions = chunkArray(orderedDrawPositions, 2);
      roundProfile[roundNumber].drawPositions = orderedDrawPositions;
      roundProfile[roundNumber].pairedDrawPositions = pairedDrawPositions;
    } else {
      const priorRound = roundProfile[roundNumber - 1];
      const priorRoundDrawPositions = priorRound.drawPositions;
      const chunkFactor = priorRound.matchUpsCount / roundProfile[roundNumber].matchUpsCount;
      const priorRoundDrawPositionChunks = chunkArray(priorRoundDrawPositions, chunkFactor);

      // ensures that drawPositions are returned in top to bottom order
      const roundDrawPositions = currentRoundMatchUps.map((matchUp) => {
        const { roundPosition } = matchUp;
        const drawPositions = [...(matchUp.drawPositions ?? []), undefined, undefined].slice(0, 2); // accounts for empty array, should always have length 2

        if (!roundPosition) return drawPositions;

        const filteredDrawPositions = drawPositions?.filter(Boolean) ?? [];
        if (!filteredDrawPositions?.length) return [undefined, undefined];

        // { roundNumber: 2 } is the first possible feed round and the last time that a numeric sort is guaranteed to work
        if (roundNumber < 3 && filteredDrawPositions?.length === 2) {
          return drawPositions?.slice().sort(numericSort); // make a copy of the values to avoid mutating the original
        }

        const isFeedRound =
          intersection(priorRoundDrawPositions, filteredDrawPositions).length !== filteredDrawPositions?.length;

        // if the prior round does NOT include the one existing drawPosition then it is a feed round
        // ... and fed positions are always { sideNumber: 1 }
        if (filteredDrawPositions?.length && isFeedRound) {
          if (filteredDrawPositions?.length === 1) {
            return [filteredDrawPositions[0], undefined];
          } else {
            return drawPositions?.slice().sort(numericSort); // make a copy of the values to avoid mutating the original
          }
        }

        // otherwise determine the order of the drawPositions by looking at the prior round
        // this accounts for ADVANCED fed positions which are NOT guaranteed to be in numeric order
        // ... because a lower number fed position may be in { sideNumber: 2 } while an drawPosition advanced
        // from the first round may be in { sideNumber: 1 }
        // const targetChunkIndex = (roundPosition - 1) * 2;
        const targetChunkIndex = (roundPosition - 1) * 2;
        const targetChunks = priorRoundDrawPositionChunks.slice(targetChunkIndex, targetChunkIndex + 2);

        return targetChunks.map((chunk) => findDrawPositionInChunk(chunk, filteredDrawPositions));
      });

      roundProfile[roundNumber].drawPositions = roundDrawPositions?.flat();
      roundProfile[roundNumber].pairedDrawPositions = roundDrawPositions;
    }

    if (roundProfile[roundNumber + 1]?.matchUpsCount === roundProfile[roundNumber].matchUpsCount) {
      roundProfile[roundNumber + 1].feedRound = true;
      roundProfile[roundNumber + 1].feedRoundIndex = feedRoundIndex;
      roundProfile[roundNumber].preFeedRound = true;
      feedRoundIndex += 1;
    }
    if (roundProfile[roundNumber] && !roundProfile[roundNumber].feedRound) {
      roundProfile[roundNumber].roundIndex = roundIndex;
      roundIndex += 1;
    }
  });

  const roundsNotPowerOf2 = !!Object.values(roundProfile).some(({ matchUpsCount }) => !isPowerOf2(matchUpsCount));

  const hasNoRoundPositions = matchUps.some((matchUp) => !matchUp.roundPosition);

  return {
    hasNoRoundPositions,
    roundsNotPowerOf2,
    maxMatchUpsCount,
    roundMatchUps,
    roundNumbers,
    roundProfile,
    ...SUCCESS,
  };
}
