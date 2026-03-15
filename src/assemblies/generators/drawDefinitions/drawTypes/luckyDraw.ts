import { isConvertableInteger, isPowerOf2 } from '@Tools/math';
import { generateRange } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { addFinishingRounds } from '../addFinishingRounds';
import { generateMatchUpId } from '../generateMatchUpId';
import { treeMatchUps } from './eliminationTree';
import { buildRound } from '../buildRound';

export function luckyDraw(params) {
  const {
    qualifyingRoundNumber, // round at which participants qualify
    finishingPositionOffset,
    qualifyingPositions, // number of positions which qualify
    matchUpType,
    idPrefix,
    drawSize,
    isMock,
    uuids,
  } = params;

  if (!isConvertableInteger(drawSize) || drawSize < 2) {
    return { matchUps: [], roundsCount: 0 };
  }

  if (isPowerOf2(drawSize)) return treeMatchUps(params);

  const roundProfiles = luckyRoundProfiles(drawSize);

  const firstRound = roundProfiles.shift();
  const nodes = generateRange(1, (firstRound?.participantsCount || 0) + 1).map((drawPosition) => ({
    drawPosition,
  }));

  let matchUps: any[] = [];
  let roundNumber = 1;

  ({ matchUps } = buildRound({
    roundNumber,
    matchUpType,
    idPrefix,
    matchUps,
    isMock,
    nodes,
    uuids,
  }));
  roundNumber++;

  let roundLimit = params.roundLimit || qualifyingRoundNumber;

  for (const roundProfile of roundProfiles) {
    const roundMatchUpsCount = roundProfile.participantsCount / 2;
    const roundPositionRange = generateRange(1, roundMatchUpsCount + 1);

    if (qualifyingPositions && roundMatchUpsCount === qualifyingPositions) {
      roundLimit = roundNumber - 1;
    }

    const roundMatchUps = roundPositionRange.map((roundPosition) => {
      const matchUpId = generateMatchUpId({
        roundPosition: roundPosition,
        roundNumber,
        idPrefix,
        uuids,
      });

      return {
        roundPosition,
        roundNumber,
        matchUpId,
      };
    });

    matchUps.push(...roundMatchUps);
    roundNumber++;
  }

  const roundsCount = roundNumber - 1; // because roundNumber was incremented at the end of the while loop

  matchUps = addFinishingRounds({
    finishingPositionOffset,
    lucky: true,
    roundsCount,
    roundLimit,
    matchUps,
  });

  if (roundLimit) {
    matchUps = matchUps.filter((matchUp) => matchUp.roundNumber <= roundLimit);
  }

  return { matchUps, roundsCount, roundLimit };
}

export function luckyRoundProfiles(drawSize) {
  const intDrawSize = ensureInt(drawSize);
  let participantsCount = intDrawSize % 2 ? intDrawSize + 1 : intDrawSize;
  const preFeedRound = !!(Math.ceil(participantsCount / 2) % 2);
  const rounds: any[] = [{ participantsCount, preFeedRound }];
  while (participantsCount > 2) {
    const nextRound = Math.ceil(participantsCount / 2);
    const nextIsFinal = nextRound === 1;
    const feedRound = !!(!nextIsFinal && nextRound % 2);
    participantsCount = !nextIsFinal && feedRound ? nextRound + 1 : nextRound;
    const preFeedRound = !!(participantsCount !== 2 && Math.ceil(participantsCount / 2) % 2);
    rounds.push({ participantsCount, preFeedRound, feedRound });
  }
  return rounds;
}
