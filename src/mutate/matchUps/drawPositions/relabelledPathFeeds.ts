import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getDrawPositionWinCount, isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import {
  structureMatchUpsInContext,
  departingLoserPathRefusal,
  reconcileFedLoserEligibility,
} from '@Mutate/matchUps/drawPositions/reconcileFedLoserEligibility';

// constants and types
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import type {
  DrawDefinition,
  DrawLink,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  Score,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

/**
 * # The `FIRST_MATCHUP` feeds a flip RELABELS — the later-round losses on the winner's path
 *
 * `swapWinnerLoser` relabels the old winner's path: every later matchUp they reached now holds the old loser,
 * with its results intact. When the old winner LOST one of those later matchUps, the old loser now holds that
 * loss — and if that round feeds a `FIRST_MATCHUP` link, the feed rule has to be asked again, about a
 * different participant. Their first match is not the old winner's: it is the flipped matchUp, and what they
 * won before it.
 *
 * The rule (zero prior SCORED wins, `getDrawPositionWinCount`) can then answer differently:
 *
 * - the flipped win is a walkover or an unscored default, so the new occupant of the later loss is ELIGIBLE where
 *   the old winner was not: the BYE `directLoser` placed in the fed slot stands, and the loser the rule admits is
 *   absent — `DROPPED_PROGRESSION`;
 * - the flipped win is scored, so the new occupant is INELIGIBLE where the old winner was not, and the relabel
 *   writes them into a structure they may not enter — `INELIGIBLE_PROGRESSION`.
 *
 * `reconcileFedLoserEligibility` already asks the question for the FLIPPED matchUp's own loser; it was never
 * asked for the losers the flip relabels further on. Census family F1 (run 13: 265 seeds, all
 * FIRST_MATCH_LOSER_CONSOLATION, all under `allowChangePropagation`) is that gap: the shrunk seeds re-score a
 * first-round result after its winner has lost round 2.
 *
 * Both halves follow the flipped matchUp's own: a question asked BEFORE anything is written, which refuses when
 * the slot the reconciliation would write is ACTIVE (CA, 2026-09-17: refuse the swap when propagation cannot
 * proceed with equivalence), and the state reconciliation AFTER the result is applied.
 */

export type PathFeed = {
  loserMatchUpDrawPositionIndex?: number;
  inContextMatchUp: HydratedMatchUp;
  loserMatchUp?: HydratedMatchUp;
  loserDrawPosition: number;
  loserTargetLink: DrawLink;
};

/**
 * The decided matchUps after `flippedRoundNumber` that hold `drawPosition` and feed a `FIRST_MATCHUP` link,
 * each with the drawPosition that lost it and that link's target.
 */
function pathFeeds({
  inContextDrawMatchUps,
  flippedRoundNumber,
  drawDefinition,
  drawPosition,
  structureId,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  flippedRoundNumber: number;
  drawPosition: number;
  structureId: string;
}): PathFeed[] {
  const feeds: PathFeed[] = [];
  const pathMatchUps = inContextDrawMatchUps
    .filter(
      (matchUp) =>
        matchUp.structureId === structureId &&
        !matchUp.collectionId &&
        matchUp.winningSide &&
        (matchUp.roundNumber ?? 0) > flippedRoundNumber &&
        matchUp.drawPositions?.includes(drawPosition),
    )
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));

  for (const inContextMatchUp of pathMatchUps) {
    const targets = positionTargets({
      matchUpId: inContextMatchUp.matchUpId,
      inContextDrawMatchUps,
      inContextMatchUp,
      drawDefinition,
    });
    const loserTargetLink = targets.targetLinks?.loserTargetLink;
    if (loserTargetLink?.linkCondition !== FIRST_MATCHUP) continue;

    const loserDrawPosition = inContextMatchUp.sides?.find(
      (side) => side?.sideNumber !== inContextMatchUp.winningSide,
    )?.drawPosition;
    if (!loserDrawPosition) continue;

    feeds.push({
      loserMatchUpDrawPositionIndex: targets.targetMatchUps?.loserMatchUpDrawPositionIndex,
      loserMatchUp: targets.targetMatchUps?.loserMatchUp,
      loserDrawPosition,
      inContextMatchUp,
      loserTargetLink,
    });
  }
  return feeds;
}

/**
 * Would the flip have to write a `FIRST_MATCHUP` slot that is ACTIVE — asked BEFORE anything is written.
 *
 * Eligibility AFTER the flip is counted here, because the draw still holds the old result. The count is the
 * shared one (`getDrawPositionWinCount`), applied to what the new occupant of the later loss will have won:
 * their own matchUps before the flipped round, the flipped matchUp itself (a win, scored or not as the new
 * outcome is), and the old winner's matchUps between the flipped round and the later loss, which they inherit.
 * The new outcome is read as the RESULTING RECORD reads, with the fallbacks `feedEligibilityChange` uses:
 * `COMPLETED` when no status is sent, and the existing score when none is.
 */
type PathFeedArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  /**
   * `inContextDrawMatchUps` is the whole draw, read in place of every hydration this makes (outcome v2's structural
   * index). Not set, the structure's matchUps and the target's profile are hydrated, as v1 asks it
   */
  fromIndex?: boolean;
  existingWinnerDrawPosition?: number;
  existingLoserDrawPosition?: number;
  drawDefinition: DrawDefinition;
  flippedRoundNumber?: number;
  matchUpStatus?: MatchUpStatusUnion;
  structure: Structure;
  matchUp?: MatchUp;
  event?: Event;
  score?: Score;
};

/**
 * The later losses on the flipped path that feed `FIRST_MATCHUP` and whose fed loser's eligibility the flip changes: the
 * feeds `reconcileRelabelledPathFeeds` writes after the flip (a placement or a revert to a BYE). Empty, the relabel is
 * all a swap writes for them. Shared by the refusal below, asked before the flip writes, and by outcome v2's plan.
 */
export function relabelledPathFeedChanges({
  existingWinnerDrawPosition,
  existingLoserDrawPosition,
  inContextDrawMatchUps,
  flippedRoundNumber,
  drawDefinition,
  matchUpStatus,
  structure,
  fromIndex,
  matchUp,
  event,
  score,
}: PathFeedArgs): { feed: PathFeed; eligibleAfter: boolean }[] {
  if (!flippedRoundNumber || !existingWinnerDrawPosition || !existingLoserDrawPosition) return [];

  const feeds = pathFeeds({
    inContextDrawMatchUps: inContextDrawMatchUps ?? [],
    drawPosition: existingWinnerDrawPosition,
    structureId: structure.structureId,
    flippedRoundNumber,
    drawDefinition,
  }).filter((feed) => feed.loserDrawPosition === existingWinnerDrawPosition);
  if (!feeds.length) return [];

  const indexed = fromIndex ? inContextDrawMatchUps : undefined;
  const matchUps = structureMatchUpsInContext({ inContextDrawMatchUps: indexed, drawDefinition, structure, event });
  const sourceMatchUps = teamLevelMatchUps(matchUps ?? []);
  const winsIn = (drawPosition: number, from: number, to: number) =>
    getDrawPositionWinCount({
      sourceMatchUps: sourceMatchUps.filter(
        (candidate) => (candidate.roundNumber ?? 0) > from && (candidate.roundNumber ?? 0) < to,
      ),
      drawPosition,
    });
  const flippedWinIsScored = !isUnscoredOutcome({
    matchUpStatus: matchUpStatus ?? COMPLETED,
    score: score ?? matchUp?.score,
  });

  const changes: { feed: PathFeed; eligibleAfter: boolean }[] = [];
  for (const feed of feeds) {
    const feedRoundNumber = feed.inContextMatchUp.roundNumber ?? 0;
    const eligibleBefore = isFedLoserEligible({
      loserDrawPosition: existingWinnerDrawPosition,
      loserTargetLink: feed.loserTargetLink,
      sourceMatchUps,
    });
    const winsAfter =
      winsIn(existingLoserDrawPosition, 0, flippedRoundNumber) +
      (flippedWinIsScored ? 1 : 0) +
      winsIn(existingWinnerDrawPosition, flippedRoundNumber, feedRoundNumber);
    const eligibleAfter = winsAfter === 0;
    if (eligibleBefore !== eligibleAfter) changes.push({ feed, eligibleAfter });
  }
  return changes;
}

export function relabelledPathFeedRefusal({
  existingWinnerDrawPosition,
  existingLoserDrawPosition,
  inContextDrawMatchUps,
  flippedRoundNumber,
  drawDefinition,
  matchUpStatus,
  structure,
  fromIndex,
  matchUp,
  event,
  score,
}: PathFeedArgs): ResultType | undefined {
  const indexed = fromIndex ? inContextDrawMatchUps : undefined;
  const changes = relabelledPathFeedChanges({
    existingWinnerDrawPosition,
    existingLoserDrawPosition,
    inContextDrawMatchUps,
    flippedRoundNumber,
    drawDefinition,
    matchUpStatus,
    structure,
    fromIndex,
    matchUp,
    event,
    score,
  });

  for (const { feed, eligibleAfter } of changes) {
    const targetStructureId = feed.loserTargetLink.target?.structureId;
    if (!targetStructureId) continue;

    if (eligibleAfter) {
      // the BYE standing in the fed slot is displaced by the placement
      const drawPositions = (feed.loserMatchUp?.drawPositions ?? []).filter(Boolean) as number[];
      if (!drawPositions.length) continue;
      const fedDrawPosition = Math.min(...drawPositions);
      const { activeDrawPositions } = getStructureDrawPositionProfiles({
        inContextDrawMatchUps: indexed,
        structureId: targetStructureId,
        drawDefinition,
      });
      if (activeDrawPositions?.includes(fedDrawPosition)) return { error: DRAW_POSITION_ACTIVE };
    } else {
      // the old winner's slot reverts to a BYE, taking back what was won from it
      const { positionAssignments } = getPositionAssignments({ structureId: structure.structureId, drawDefinition });
      const departingLoserParticipantId = positionAssignments?.find(
        (assignment) => assignment.drawPosition === existingWinnerDrawPosition,
      )?.participantId;
      const refusal = departingLoserPathRefusal({
        inContextDrawMatchUps: indexed,
        departingLoserParticipantId,
        targetStructureId,
        drawDefinition,
      });
      if (refusal?.error) return refusal;
    }
  }
  return undefined;
}

/**
 * After the flip is applied, make each `FIRST_MATCHUP` slot the relabelled path feeds hold what the rule says.
 *
 * A STATE check, like `reconcileFedLoserEligibility`, which it runs once per feed: a later loss whose loser
 * did not change is already reconciled and is left as it is.
 */
export function reconcileRelabelledPathFeeds({
  propagateRetirementAsExit,
  propagateExitStatus,
  flippedRoundNumber,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structure,
  event,
}: {
  propagateRetirementAsExit?: boolean;
  tournamentRecord?: Tournament;
  propagateExitStatus?: boolean;
  drawDefinition: DrawDefinition;
  flippedRoundNumber?: number;
  matchUpsMap?: MatchUpsMap;
  drawPosition?: number;
  structure: Structure;
  event?: Event;
}): ResultType & { context?: ResultType['context'] } {
  if (!flippedRoundNumber || !drawPosition) return { ...SUCCESS };

  const { matchUps: inContextDrawMatchUps = [] } = getAllDrawMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    tournamentRecord,
    drawDefinition,
    event,
  });

  let context;
  for (const feed of pathFeeds({
    structureId: structure.structureId,
    inContextDrawMatchUps,
    flippedRoundNumber,
    drawDefinition,
    drawPosition,
  })) {
    const { inContextMatchUp } = feed;
    const result: ResultType = reconcileFedLoserEligibility({
      loserMatchUpDrawPositionIndex: feed.loserMatchUpDrawPositionIndex,
      sourceMatchUpStatusCodes: (inContextMatchUp.matchUpStatusCodes ?? []).map(String),
      sourceMatchUpStatus: inContextMatchUp.matchUpStatus,
      sourceMatchUpId: inContextMatchUp.matchUpId,
      winningSide: inContextMatchUp.winningSide,
      loserDrawPosition: feed.loserDrawPosition,
      loserTargetLink: feed.loserTargetLink,
      loserMatchUp: feed.loserMatchUp,
      propagateRetirementAsExit,
      inContextDrawMatchUps,
      propagateExitStatus,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
      event,
    });
    if (result.error) return result;
    if (result.context?.progressExitStatus && !context) {
      // the propagation loop in `setMatchUpStatus` drives from this, so it names the later loss as its source
      context = {
        ...result.context,
        sourceMatchUpStatusCodes: inContextMatchUp.matchUpStatusCodes ?? [],
        sourceMatchUpStatus: inContextMatchUp.matchUpStatus,
        sourceWinningSide: inContextMatchUp.winningSide,
        sourceMatchUpId: inContextMatchUp.matchUpId,
        loserMatchUp: feed.loserMatchUp,
        matchUpsMap,
      };
    }
  }
  return { ...SUCCESS, ...(context ? { context } : {}) };
}
