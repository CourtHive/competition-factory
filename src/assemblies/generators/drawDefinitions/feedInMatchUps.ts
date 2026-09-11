import { generateRange, instanceCount } from '@Tools/arrays';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { addFinishingRounds } from './addFinishingRounds';
import { nearestPowerOf2 } from '@Tools/math';
import { buildFeedRound } from './buildFeedRound';
import { buildRound } from './buildRound';

import { MatchUp } from '@Types/tournamentTypes';

type FeedInMatchUpsArgs = {
  linkFedFinishingRoundNumbers?: number[];
  finishingPositionOffset?: number;
  linkFedRoundNumbers?: number[];
  feedsFromFinal?: number;
  isConsolation?: boolean;
  feedRoundsProfile?: any;
  baseDrawSize?: number;
  feedRounds?: number;
  skipRounds?: number;
  matchUpType?: string;
  idPrefix?: string;
  drawSize?: number;
  isMock?: boolean;
  uuids?: string[];
  fmlc?: boolean;
};

export function feedInMatchUps(params: FeedInMatchUpsArgs) {
  const drawSize = params.drawSize;
  let { feedRoundsProfile, feedRounds = 0, skipRounds = 0, baseDrawSize } = params;

  const {
    linkFedFinishingRoundNumbers,
    finishingPositionOffset,
    linkFedRoundNumbers,
    feedsFromFinal,
    isConsolation,
    matchUpType,
    idPrefix,
    isMock,
    uuids,
    fmlc,
  } = params;
  // calculate the number of rounds and the number of matchUps in each round
  // for normal elimination structure
  baseDrawSize = baseDrawSize ?? getBaseDrawSize(drawSize);
  const baseDrawRounds = roundMatchCounts({ drawSize: baseDrawSize });
  const baseRoundsCount = baseDrawRounds.length;

  let positionsFed = 0;
  if (feedRoundsProfile?.length) {
    positionsFed = feedRoundsProfile.reduce((a, b) => a + b, 0);
  } else if (drawSize) {
    // having a drawSize defined trumps other configuration options
    let positionsToFeed = drawSize - baseDrawSize;
    feedRoundsProfile = baseDrawRounds.filter((feedSize) => {
      if (feedSize <= positionsToFeed) {
        positionsToFeed -= feedSize;
        return true;
      }
      return false;
    });
    positionsFed = feedRoundsProfile.reduce((a, b) => a + b, 0);
    feedRounds = feedRoundsProfile.length;
  } else {
    // if skipRounds is set higher than baseRoundsCount then there are no feedRounds
    if (skipRounds >= baseRoundsCount) {
      feedRounds = 0;
    } else if (feedsFromFinal) {
      // if feedsFromFinal is defined, calculate number of feed rounds from Final Match
      // e.g. feedsFromFinal is 1 for Semifinal, 2 for QuarterFinals, 3 for Round of 16
      feedRounds = baseRoundsCount - feedsFromFinal;
      skipRounds = 0;
    }

    // Given the above, feedsFromFinal trumps skipRounds
    // and skipRounds >= baseRoundsCount negates feedRounds
    feedRoundsProfile = baseDrawRounds.filter((feedSize, i) => {
      if (feedsFromFinal && !feedRounds) return 0;
      if (feedRounds && i >= skipRounds + feedRounds) return 0;
      if (i < skipRounds) return 0;
      return feedSize;
    });
    positionsFed = feedRoundsProfile.reduce((a, b) => a + b, 0);
    feedRounds = feedRoundsProfile.length;
  }

  const allRounds = [...baseDrawRounds, ...feedRoundsProfile].sort((a, b) => b - a);
  const roundsCount = allRounds.length;

  // rounds which have linkFed participants can be specified two ways:
  // linkFedRoundNumbers[] and linkFedFinishingRoundNumbers[]
  // the difference being which end of the draw structure === 1
  const linkFedRoundNumbersIndices = [
    ...(linkFedRoundNumbers ?? []).map((n) => n - 1),
    ...(linkFedFinishingRoundNumbers ?? []).map((n) => roundsCount - n),
  ];

  // positionsFedByLinks can be determined by summing the values in allRounds
  // which are found at linkFedRoundNumbersIndices
  const positionsFedByLinks = linkFedRoundNumbersIndices.map((i) => allRounds[i]).reduce((a, b) => a + b, 0);
  positionsFed = positionsFed - positionsFedByLinks;

  // initialize round creation variables
  let fed = 0; // keep track of even/odd feed rounds
  let matchUps: MatchUp[] = []; // accumulate matchUps
  let roundNodes; // an array of nodes
  let roundNumber = 1; // initial roundNumber

  // firstRoundDrawPositions are generated and assigned drawPositions
  const firstRoundDrawPositions = generateRange(0, baseDrawSize).map((_, i) => ({
    drawPosition: i + 1 + positionsFed,
  }));

  // initial nodes fed into buildRound
  let nodes = firstRoundDrawPositions;

  // drawPosition within structure; offset used for feedRounds
  let drawPosition: number | undefined = positionsFed + 1;

  for (const baseDrawRound of baseDrawRounds) {
    ({ roundNodes, matchUps } = buildRound({
      matchUpType,
      roundNumber,
      idPrefix,
      matchUps,
      isMock,
      nodes,
      uuids,
    }));
    roundNumber++;
    if (feedRoundsProfile.includes(baseDrawRound)) {
      const roundIterations = instanceCount(feedRoundsProfile)[baseDrawRound];
      const iterationRange = generateRange(0, roundIterations);
      const finishingRoundNumber = roundsCount + 1 - roundNumber;
      const isLinkFedRound =
        linkFedFinishingRoundNumbers?.includes(finishingRoundNumber) ?? linkFedRoundNumbers?.includes(roundNumber);

      iterationRange.forEach(() => {
        const iterationDrawPosition = (!isLinkFedRound && drawPosition) || undefined;
        ({ roundNodes, matchUps, drawPosition } = buildFeedRound({
          drawPosition: iterationDrawPosition,
          nodes: roundNodes,
          matchUpType,
          roundNumber,
          idPrefix,
          matchUps,
          isMock,
          uuids,
          fed,
        }));
        roundNumber++;
        fed += 1;
      });
    }
    nodes = roundNodes;
  }

  // because roundNumber was incremented at the end of the while loop
  if (roundsCount !== roundNumber - 1)
    pushGlobalLog({ method: 'feedInMatchUps', error: 'roundsCount does not match roundNumber' });

  // if this is a feed-in consolation then finishing drawPositions must be offset ...
  // ... by the number of drawPositions which will be fed into the consolation draw
  // final drawPositions will be played off twice up until the final feed round

  const consolationFinish = baseDrawSize - positionsFed;
  const modifiedFinishingPositionOffset = isConsolation ? consolationFinish : finishingPositionOffset;

  // mutates `matchUps` in place and returns the same reference; the assignment was a no-op
  addFinishingRounds({
    finishingPositionOffset: modifiedFinishingPositionOffset,
    positionsFed,
    roundsCount,
    matchUps,
    fmlc,
  });

  const draw = roundNodes?.length ? roundNodes[0] : roundNodes;
  if (draw) {
    draw.roundNumber = roundNumber - 1;
    draw.matchUps = matchUps;
  }

  return { draw, matchUps, roundsCount };

  function getBaseDrawSize(drawSize) {
    const nearestP2 = nearestPowerOf2(drawSize);
    return nearestP2 > drawSize ? nearestP2 / 2 : nearestP2;
  }
}

// returns an array of the number of matchUps in each round of an elimination draw
function roundMatchCounts({ drawSize }) {
  const rounds = Math.ceil(Math.log(drawSize) / Math.log(2));
  const range = generateRange(0, rounds).reverse();
  return range.map((r) => Math.pow(2, r));
}
