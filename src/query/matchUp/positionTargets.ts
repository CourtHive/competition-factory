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

/**
 * The lookups `positionTargets` makes over `inContextDrawMatchUps`, built ONCE for an operation that asks for the
 * targets of many matchUps of the same draw (`addGoesTo`, `addUpcomingMatchUps`). Without it every call scans the
 * whole array several times: one `addGoesTo` over a 128 FEED_IN_CHAMPIONSHIP visited ~224,000 matchUps for 253.
 *
 * It answers exactly what the scans answer, in the same order: the FIRST matchUp with an id, and each structure's
 * and each round's matchUps in array order (tie matchUps left out of the rounds, as the scans leave them out).
 * It holds references and keys on `matchUpId`, `structureId`, `roundNumber` and `matchUpTieId`, which no caller
 * changes while it iterates. `findStructure` answers are kept per structureId as they are asked for: it sorts
 * every structure of the draw on each call, and was most of the cost (SE 64 + playoffs, 31 structures). It belongs to the operation that built it: built from the array it is passed with,
 * never cached, never reused by a later call.
 */
export type TargetIndex = {
  structures: Map<string | undefined, ReturnType<typeof findStructure>>;
  byMatchUpId: Map<string, HydratedMatchUp>;
  byStructureId: Map<string | undefined, HydratedMatchUp[]>;
  roundsByStructureId: Map<string | undefined, Map<number | undefined, HydratedMatchUp[]>>;
};

export function buildTargetIndex(inContextDrawMatchUps: HydratedMatchUp[] = []): TargetIndex {
  const byMatchUpId = new Map<string, HydratedMatchUp>();
  const byStructureId = new Map<string | undefined, HydratedMatchUp[]>();
  const roundsByStructureId = new Map<string | undefined, Map<number | undefined, HydratedMatchUp[]>>();

  for (const matchUp of inContextDrawMatchUps) {
    if (!byMatchUpId.has(matchUp.matchUpId)) byMatchUpId.set(matchUp.matchUpId, matchUp);
    const { structureId, roundNumber } = matchUp;
    if (!byStructureId.has(structureId)) byStructureId.set(structureId, []);
    byStructureId.get(structureId)?.push(matchUp);
    if (matchUp.matchUpTieId) continue;
    if (!roundsByStructureId.has(structureId)) roundsByStructureId.set(structureId, new Map());
    const rounds = roundsByStructureId.get(structureId);
    if (!rounds?.has(roundNumber)) rounds?.set(roundNumber, []);
    rounds?.get(roundNumber)?.push(matchUp);
  }

  return { structures: new Map(), byMatchUpId, byStructureId, roundsByStructureId };
}

/** `findStructure`, asked once per structureId of an operation that holds an index */
export function indexedStructure({
  drawDefinition,
  targetIndex,
  structureId,
}: {
  drawDefinition: DrawDefinition;
  targetIndex?: TargetIndex;
  structureId?: string;
}): ReturnType<typeof findStructure> {
  if (!targetIndex) return findStructure({ drawDefinition, structureId });
  if (!targetIndex.structures.has(structureId)) {
    targetIndex.structures.set(structureId, findStructure({ drawDefinition, structureId }));
  }
  return targetIndex.structures.get(structureId) as ReturnType<typeof findStructure>;
}

/** a structure's round as the scan `roundNumber === n && !matchUpTieId` finds it; NaN is no round */
export function indexedRound(
  targetIndex: TargetIndex,
  structureId: string | undefined,
  roundNumber?: number,
): HydratedMatchUp[] {
  if (Number.isNaN(roundNumber)) return [];
  return targetIndex.roundsByStructureId.get(structureId)?.get(roundNumber) ?? [];
}

type PositionTargetsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  targetIndex?: TargetIndex;
  /**
   * The targets are returned as COPIES (`definedAttributes` deep-copies the matchUp and each target), so a caller
   * may change what it is handed. A caller that only READS them (`addGoesTo`: ids and ranges) asks for the
   * matchUps themselves: the three copies were most of what one call cost, FEED_IN_CHAMPIONSHIP 128 measured.
   */
  asReferences?: boolean;
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
  asReferences,
  targetIndex,
  matchUpId,
}: PositionTargetsArgs): PositionTargetsResult {
  let matchUp = inContextMatchUp;
  if (inContextDrawMatchUps.length && !matchUp) {
    matchUp = targetIndex
      ? targetIndex.byMatchUpId.get(matchUpId)
      : inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  }

  const { structure } = indexedStructure({
    structureId: matchUp?.structureId,
    drawDefinition,
    targetIndex,
  });

  // a ROUND_OUTCOME structure was found from the matchUp, so the matchUp is in hand
  if (structure?.finishingPosition === ROUND_OUTCOME && matchUp) {
    return targetByRoundOutcome({
      inContextDrawMatchUps,
      useTargetMatchUpIds,
      drawDefinition,
      asReferences,
      targetIndex,
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
  asReferences,
  targetIndex,
  structure,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  useTargetMatchUpIds?: boolean;
  drawDefinition: DrawDefinition;
  asReferences?: boolean;
  targetIndex?: TargetIndex;
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
  let structureMatchUps: HydratedMatchUp[];

  const findById = (id: string) =>
    targetIndex ? targetIndex.byMatchUpId.get(id) : inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === id);

  if (useTargetMatchUpIds && (winnerMatchUpId || loserMatchUpId)) {
    winnerMatchUp = winnerMatchUpId && winnerFeedProfile !== DRAW && findById(winnerMatchUpId);
    loserMatchUp = loserMatchUpId && loserFeedProfile !== DRAW && findById(loserMatchUpId);

    // the stored ids answer alone when they cover every edge the matchUp has: its winner's, and its loser's wherever a
    // loser link exists. A matchUp storing only one keeps it, and the other is derived below from the links, as if
    // none were stored (CA 2026-10-26, hydration OPEN-10)
    const covered = !!winnerMatchUpId && (!!loserMatchUpId || !loserTargetLink);
    if (covered && (winnerMatchUp || loserMatchUp)) {
      return {
        matchUp,
        targetLinks: { loserTargetLink, winnerTargetLink },
        targetMatchUps: { loserMatchUp, winnerMatchUp },
      };
    }
    winnerMatchUp ||= undefined;
    loserMatchUp ||= undefined;
  }

  const { roundPosition: sourceRoundPosition } = matchUp;
  structureMatchUps = targetIndex
    ? (targetIndex.byStructureId.get(structure.structureId) ?? [])
    : inContextDrawMatchUps.filter((matchUp) => matchUp.structureId === structure.structureId);
  const sourceRoundMatchUpCount = targetIndex
    ? indexedRound(targetIndex, structure.structureId, matchUp.roundNumber).length
    : structureMatchUps.reduce((count, currentMatchUp) => {
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
      targetIndex,
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
      targetIndex,
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
      targetIndex,
    }));
  }

  if (!winnerMatchUp) {
    // if there is no winnerTargetLink then find targetMatchUp in next round
    const roundMatchUps = targetIndex
      ? (roundNumber?: number) => indexedRound(targetIndex, structure.structureId, roundNumber)
      : undefined;
    ({ matchUp: winnerMatchUp } = getNextRoundMatchUp({
      structureMatchUps,
      roundMatchUps,
      matchUp,
    }));
  }

  const targets = {
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
  };
  return asReferences ? targets : definedAttributes(targets);
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
