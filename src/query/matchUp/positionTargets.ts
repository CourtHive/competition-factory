import { getRoundLinks, getTargetLink } from '@Query/drawDefinition/linkGetter';
import { getNextRoundMatchUp } from '@Query/matchUps/getNextRoundMatchUp';
import { getTargetMatchUp } from '@Query/matchUps/getTargetMatchUp';
import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { LOSER, WINNER, ROUND_OUTCOME, DRAW, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * @param {string=} matchUpId - matchUp identifier for sourceMatchUp
 * @param {object=} structure - structure within which matchUp occurs
 * @param {object=} drawDefinition - drawDefinition within which structure occurs
 * @param {object[]=} inContextDrawMatchUps - array of all draw matchUps (for optimiation)
 * @param {object=} inContextMatchUp - source matchUp with context
 * @param {boolean=} useTargetMatchUpIds - whether to use { loserMatchUpId, winnerMatchUpId } to find targets
 *
 * targetMatchUpIds are used for optimization when fetching targetMatchUps for the purpose of displaying upcoming scheduling information
 * (!!) when targetMatchUpIds are used targetDrawPositions are not retrieved (!!)
 * targetDrawPositions are necessary for participant movement logic
 */

type PositionTargetsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  useTargetMatchUpIds?: boolean;
  drawDefinition: DrawDefinition;
  matchUpId: string;
};

export function positionTargets({
  inContextDrawMatchUps = [],
  useTargetMatchUpIds,
  inContextMatchUp,
  drawDefinition,
  matchUpId,
}: PositionTargetsArgs) {
  let matchUp = inContextMatchUp;
  if (inContextDrawMatchUps.length && !matchUp) {
    matchUp = inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  }

  const { structure } = findStructure({
    structureId: matchUp?.structureId,
    drawDefinition,
  });

  const finishingPosition = structure?.finishingPosition;
  if (finishingPosition === ROUND_OUTCOME) {
    return targetByRoundOutcome({
      inContextDrawMatchUps,
      useTargetMatchUpIds,
      drawDefinition,
      structure,
      matchUp,
    });
  } else {
    return targetByWinRatio({ matchUp });
  }
}

function targetByRoundOutcome({ inContextDrawMatchUps, useTargetMatchUpIds, drawDefinition, structure, matchUp }) {
  const { winnerMatchUpId, loserMatchUpId } = matchUp;
  const { links } = getRoundLinks({
    roundNumber: matchUp.roundNumber,
    structureId: structure.structureId,
    drawDefinition,
  });
  const source = links?.source;

  const winnerTargetLink = getTargetLink({ source, linkType: WINNER });
  const byeTargetLink = getTargetLink({
    linkCondition: FIRST_MATCHUP,
    linkType: LOSER,
    source,
  });
  let loserTargetLink = getTargetLink({ source, linkType: LOSER });

  /**
   * A MALFORMED ROUND LINK IS AN ERROR (CA, 2026-10-06). A WINNER or LOSER link with no
   * `source.roundNumber` cannot say which round it directs, and `getTargetLink` answers it with an
   * error in place of the link. Passed on as a link it reached `getTargetMatchUp`, which read
   * `.target` off it and threw. It is returned here, naming the link and the matchUp, and every
   * caller propagates it. A round with no link at all is not this: it has no target link and is
   * directed exactly as before.
   */
  const malformed = [winnerTargetLink, byeTargetLink, loserTargetLink].find((link) => link?.error);
  if (malformed) {
    return decorateResult({
      context: { matchUpId: matchUp.matchUpId, structureId: structure.structureId, roundNumber: matchUp.roundNumber },
      info: 'a WINNER or LOSER link has no source roundNumber',
      stack: 'positionTargets',
      result: malformed,
    });
  }

  const propagateByeFMLC = byeTargetLink && loserTargetLink;
  if (!loserTargetLink) loserTargetLink = byeTargetLink;

  const winnerFeedProfile = winnerTargetLink?.target?.feedProfile;
  const loserFeedProfile = loserTargetLink?.target?.feedProfile;
  const byeFeedProfile = byeTargetLink?.target?.feedProfile;

  let byeMatchUp, byeTargetDrawPosition, byeMatchUpDrawPositionIndex;
  let loserMatchUp, loserTargetDrawPosition, loserMatchUpDrawPositionIndex;
  let winnerMatchUp, winnerTargetDrawPosition, winnerMatchUpDrawPositionIndex;
  let structureMatchUps;

  if (useTargetMatchUpIds && (winnerMatchUpId || loserMatchUpId)) {
    winnerMatchUp =
      winnerMatchUpId &&
      winnerFeedProfile !== DRAW &&
      inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === winnerMatchUpId);
    loserMatchUp =
      loserMatchUpId &&
      loserFeedProfile !== DRAW &&
      inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === loserMatchUpId);

    if (winnerMatchUp || loserMatchUp) {
      return {
        matchUp,
        targetLinks: { loserTargetLink, winnerTargetLink },
        targetMatchUps: { loserMatchUp, winnerMatchUp },
      };
    }
  }

  const { roundPosition: sourceRoundPosition } = matchUp;
  structureMatchUps =
    structureMatchUps || inContextDrawMatchUps.filter((matchUp) => matchUp.structureId === structure.structureId);
  const sourceRoundMatchUpCount = structureMatchUps.reduce((count, currentMatchUp) => {
    return currentMatchUp.roundNumber === matchUp.roundNumber && !currentMatchUp.matchUpTieId // exclude tieMatchUps
      ? count + 1
      : count;
  }, 0);

  if (loserTargetLink && !loserMatchUp && loserFeedProfile !== DRAW) {
    ({
      matchUpDrawPositionIndex: loserMatchUpDrawPositionIndex,
      targetDrawPosition: loserTargetDrawPosition,
      matchUp: loserMatchUp,
    } = getTargetMatchUp({
      targetLink: loserTargetLink,
      sourceRoundMatchUpCount,
      inContextDrawMatchUps,
      sourceRoundPosition,
      drawDefinition,
    }));
  }

  if (propagateByeFMLC && byeFeedProfile !== DRAW) {
    ({
      matchUpDrawPositionIndex: byeMatchUpDrawPositionIndex,
      targetDrawPosition: byeTargetDrawPosition,
      matchUp: byeMatchUp,
    } = getTargetMatchUp({
      targetLink: byeTargetLink,
      sourceRoundMatchUpCount,
      inContextDrawMatchUps,
      sourceRoundPosition,
      drawDefinition,
    }));
  }

  if (winnerTargetLink && !winnerMatchUp && winnerFeedProfile !== DRAW) {
    ({
      matchUpDrawPositionIndex: winnerMatchUpDrawPositionIndex,
      targetDrawPosition: winnerTargetDrawPosition,
      matchUp: winnerMatchUp,
    } = getTargetMatchUp({
      targetLink: winnerTargetLink,
      sourceRoundMatchUpCount,
      inContextDrawMatchUps,
      sourceRoundPosition,
      drawDefinition,
    }));
  }

  if (!winnerMatchUp) {
    // if there is no winnerTargetLink then find targetMatchUp in next round
    structureMatchUps =
      structureMatchUps || inContextDrawMatchUps.filter((matchUp) => matchUp.structureId === structure.structureId);
    ({ matchUp: winnerMatchUp } = getNextRoundMatchUp({
      structureMatchUps,
      matchUp,
    }));
  }

  return definedAttributes({
    matchUp,
    targetLinks: { loserTargetLink, winnerTargetLink, byeTargetLink },
    targetMatchUps: {
      winnerMatchUpDrawPositionIndex,
      loserMatchUpDrawPositionIndex,
      byeMatchUpDrawPositionIndex,
      winnerTargetDrawPosition,
      loserTargetDrawPosition,
      byeTargetDrawPosition,
      winnerMatchUp,
      loserMatchUp,
      byeMatchUp,
    },
    targetMatchUpIds: !!(winnerMatchUpId || loserMatchUpId),
  });
}

function targetByWinRatio({ matchUp }) {
  return {
    targetLinks: { loserTargetLink: undefined, winnerTargetLink: undefined }, // returned for testing
    targetMatchUps: { loserMatchUp: undefined, winnerMatchUp: undefined },
    matchUp,
  };
}
