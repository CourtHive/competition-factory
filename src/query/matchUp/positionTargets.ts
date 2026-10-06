import { getRoundLinks, getTargetLink, TargetLinkError } from '@Query/drawDefinition/linkGetter';
import { getNextRoundMatchUp } from '@Query/matchUps/getNextRoundMatchUp';
import { getTargetMatchUp } from '@Query/matchUps/getTargetMatchUp';
import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { LOSER, WINNER, ROUND_OUTCOME, DRAW, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';
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

export type PositionTargetMatchUps = {
  winnerMatchUpDrawPositionIndex?: number;
  loserMatchUpDrawPositionIndex?: number;
  byeMatchUpDrawPositionIndex?: number;
  winnerTargetDrawPosition?: number;
  loserTargetDrawPosition?: number;
  byeTargetDrawPosition?: number;
  winnerMatchUp?: HydratedMatchUp;
  loserMatchUp?: HydratedMatchUp;
  byeMatchUp?: HydratedMatchUp;
};

/** a round's target links; a malformed one is never among them, it is the result's error instead */
export type PositionTargetLinks = {
  winnerTargetLink?: DrawLink;
  loserTargetLink?: DrawLink;
  byeTargetLink?: DrawLink;
};

export type PositionTargets = {
  targetMatchUps: PositionTargetMatchUps;
  targetLinks: PositionTargetLinks;
  targetMatchUpIds?: boolean;
  matchUp?: HydratedMatchUp;
  error?: undefined;
};

/** the targets, or the error a malformed round link (a WINNER/LOSER link with no source round) is */
export type PositionTargetsResult =
  PositionTargets | (TargetLinkError & { targetMatchUps?: undefined; targetLinks?: undefined; matchUp?: undefined });

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
}: PositionTargetsArgs): PositionTargetsResult {
  let matchUp = inContextMatchUp;
  if (inContextDrawMatchUps.length && !matchUp) {
    matchUp = inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  }

  const { structure } = findStructure({
    structureId: matchUp?.structureId,
    drawDefinition,
  });

  // a ROUND_OUTCOME structure was found from the matchUp, so the matchUp is in hand
  if (structure?.finishingPosition === ROUND_OUTCOME && matchUp) {
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

function targetByRoundOutcome({
  inContextDrawMatchUps,
  useTargetMatchUpIds,
  drawDefinition,
  structure,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  useTargetMatchUpIds?: boolean;
  drawDefinition: DrawDefinition;
  structure: Structure;
  matchUp: HydratedMatchUp;
}): PositionTargetsResult {
  const { winnerMatchUpId, loserMatchUpId } = matchUp;
  const { links } = getRoundLinks({
    roundNumber: matchUp.roundNumber,
    structureId: structure.structureId,
    drawDefinition,
  });
  const roundLinks = getRoundTargetLinks(links?.source);
  if (roundLinks.error) {
    const context = {
      matchUpId: matchUp.matchUpId,
      structureId: structure.structureId,
      roundNumber: matchUp.roundNumber,
    };
    const info = 'a WINNER or LOSER link has no source roundNumber';
    return {
      ...decorateResult({ result: roundLinks, stack: 'positionTargets', context, info }),
      error: roundLinks.error,
    };
  }
  const { winnerTargetLink, byeTargetLink } = roundLinks;
  let { loserTargetLink } = roundLinks;

  const propagateByeFMLC = byeTargetLink && loserTargetLink;
  loserTargetLink ??= byeTargetLink;

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

const isLinkError = (link?: DrawLink | TargetLinkError): link is TargetLinkError => !!link && 'error' in link;

/**
 * A MALFORMED ROUND LINK IS AN ERROR (CA, 2026-10-06). A WINNER or LOSER link with no
 * `source.roundNumber` cannot say which round it directs, and `getTargetLink` answers it with an
 * error in place of the link. Passed on as a link it reached `getTargetMatchUp`, which read
 * `.target` off it and threw. It is returned here, and `positionTargets` returns it naming the
 * matchUp; every caller propagates it. A round with no link at all is not this: it has no target
 * link and is directed exactly as before.
 */
function getRoundTargetLinks(source: DrawLink[]): (PositionTargetLinks & { error?: undefined }) | TargetLinkError {
  const winnerTargetLink = getTargetLink({ source, linkType: WINNER });
  const byeTargetLink = getTargetLink({
    linkCondition: FIRST_MATCHUP,
    linkType: LOSER,
    source,
  });
  const loserTargetLink = getTargetLink({ source, linkType: LOSER });

  if (isLinkError(winnerTargetLink)) return winnerTargetLink;
  if (isLinkError(byeTargetLink)) return byeTargetLink;
  if (isLinkError(loserTargetLink)) return loserTargetLink;
  return { winnerTargetLink, byeTargetLink, loserTargetLink };
}

function targetByWinRatio({ matchUp }: { matchUp?: HydratedMatchUp }): PositionTargetsResult {
  return {
    targetLinks: { loserTargetLink: undefined, winnerTargetLink: undefined }, // returned for testing
    targetMatchUps: { loserMatchUp: undefined, winnerMatchUp: undefined },
    matchUp,
  };
}
