import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { feedEligibilityChange } from '@Mutate/matchUps/matchUpStatus/feedEligibilityGuard';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { lastSetFormatIsTimed } from '@Query/matchUp/lastSetFormatisTimed';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { isObject } from '@Tools/objects';

// constants and types
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { BuildViewArgs, OutcomeRequest, OutcomeView } from './types';
import type { DrawDefinition, Event, MatchUp, PositionAssignment, Structure } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * The outcome pipeline, v2: the view.
 *
 * Everything § 2 asks of the draw, answered once and read-only. The questions are asked through the
 * engine's QUERIES (`positionTargets`, `isActiveDownstream`, `hasPropagatedExitDownstream`,
 * `analyzeMatchUp`, …): a function that takes the draw and answers a question is a query and v2
 * calls it; a function that takes params and returns a result is the v1 pipeline and v2 imports
 * none of it. `feedEligibilityChange` is a predicate on the draw and sits on the query side of that
 * line despite its directory.
 *
 * Nothing here writes. v1's `handleTeamAutoCalc` stamps `disableAutoCalc` and ensures line-ups on
 * its way to a refusal; the view projects the dual's winner instead and leaves both to the apply.
 */

const LIVE_OR_UNSET = new Set<string | undefined>([undefined, TO_BE_PLAYED]);

/** § 2.1, as the spec states it: may an exit with one participant be awarded to the empty side? */
function exitAwardable(
  positionAssignments: PositionAssignment[],
  inContextMatchUp: HydratedMatchUp | undefined,
  winningSide?: number,
): boolean {
  const winnerSide = (inContextMatchUp?.sides ?? []).find((side) => side?.sideNumber === winningSide);
  if (winnerSide?.participantId) return false;
  if (winnerSide?.qualifier) return true;
  if (winnerSide?.bye) return false;
  if (winnerSide?.drawPosition === undefined) return true;
  const assignment = positionAssignments.find((entry) => entry.drawPosition === winnerSide.drawPosition);
  if (!assignment) return true;
  if (assignment.bye) return false;
  return !!(assignment.participantId || assignment.qualifier);
}

/** the wins each side's drawPosition holds in this matchUp's structure, the matchUp itself left out */
function priorWins(
  inContextDrawMatchUps: HydratedMatchUp[],
  inContextMatchUp?: HydratedMatchUp,
): { 1: number; 2: number } {
  const sourceMatchUps = inContextDrawMatchUps.filter(
    (m) => m.structureId === inContextMatchUp?.structureId && m.matchUpId !== inContextMatchUp?.matchUpId,
  );
  const wins = (sideNumber: number) => {
    const drawPosition = inContextMatchUp?.sides?.find((side) => side.sideNumber === sideNumber)?.drawPosition;
    return drawPosition ? getDrawPositionWinCount({ sourceMatchUps, drawPosition }) : 0;
  };
  return { 1: wins(1), 2: wins(2) };
}

/** a lucky draw's round with an odd number of matchUps feeds nobody forward (`checkIsPreFeedRound`) */
function luckyPreFeed(drawDefinition: DrawDefinition, matchUp: MatchUp, structure?: Structure): boolean {
  if (!isLuckyBasedDraw(drawDefinition?.drawType) || !matchUp.roundNumber || !structure?.matchUps) return false;
  return structure.matchUps.filter((m) => m.roundNumber === matchUp.roundNumber).length % 2 !== 0;
}

function resolveFormat(
  request: OutcomeRequest,
  matchUp: MatchUp,
  structure: Structure | undefined,
  drawDefinition: DrawDefinition,
  event: Event | undefined,
): string | undefined {
  return (
    request.matchUpFormat ??
    matchUp?.matchUpFormat ??
    structure?.matchUpFormat ??
    drawDefinition?.matchUpFormat ??
    event?.matchUpFormat
  );
}

export function buildOutcomeView(args: BuildViewArgs): OutcomeView {
  const { tournamentRecord, drawDefinition, event, request, policyDefinitions } = args;
  const empty: OutcomeView = {
    hasDrawDefinition: !!drawDefinition,
    formatRecognized: !request.matchUpFormat || isValidMatchUpFormat({ matchUpFormat: request.matchUpFormat }),
    drawType: drawDefinition?.drawType,
    found: false,
    isTeam: false,
    existing: { validWinningScore: false, scoreHasValue: false, scoredTime: false },
    propagatedExitStands: false,
    activeDownstream: false,
    participants: { required: false, count: 0, exitAwardable: false, requireForScoring: true },
    draw: { isAdHoc: false, teamRoundRobin: false, includesBye: false, timedTie: false },
    targets: { luckyPreFeed: false, sideParticipantIds: {}, sideDrawPositions: {}, priorWins: { 1: 0, 2: 0 } },
  };
  if (!drawDefinition || !request.matchUpId) return empty;

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });
  const matchUp = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === request.matchUpId);
  const inContextMatchUp = inContextDrawMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (!matchUp || !inContextDrawMatchUps) return empty;

  const { structure } = findStructure({ drawDefinition, structureId: inContextMatchUp?.structureId });
  const isTeam = isMatchUpEventType(TEAM)(matchUp.matchUpType);
  const matchUpTieId = inContextMatchUp?.matchUpTieId;
  // the STORED result is judged under the STORED format; what the call would decide, under the
  // format the call would apply (row 9's second and third conditions resolve differently)
  const storedFormat = resolveFormat({ flags: request.flags }, matchUp, structure, drawDefinition, event);
  const incomingFormat = resolveFormat(request, matchUp, structure, drawDefinition, event);

  const validWinningScore =
    matchUp.matchUpStatus === COMPLETED &&
    !!matchUp.winningSide &&
    !!analyzeMatchUp({ matchUp, matchUpFormat: storedFormat }).validMatchUpOutcome;
  const impliedWinningSide =
    request.score && incomingFormat
      ? analyzeMatchUp({
          matchUp: { score: request.score, matchUpFormat: incomingFormat },
          matchUpFormat: incomingFormat,
        }).calculatedWinningSide
      : undefined;

  const targetData = positionTargets({
    matchUpId: matchUpTieId || request.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  const drawView = {
    inContextDrawMatchUps,
    inContextMatchUp,
    matchUpTieId,
    matchUpsMap,
    targetData,
    structure,
    matchUp,
    drawDefinition,
  };
  const propagatedExitStands = !!hasPropagatedExitDownstream(drawView);
  const activeDownstream = !!isActiveDownstream(drawView);

  const appliedPolicies =
    getAppliedPolicies({
      policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING],
      tournamentRecord,
      drawDefinition,
      event,
    })?.appliedPolicies ?? {};
  if (isObject(policyDefinitions)) Object.assign(appliedPolicies, policyDefinitions);
  const requireForScoring = appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring !== false;

  const assignedDrawPositions = inContextMatchUp?.drawPositions?.filter(Boolean);
  const count = inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length ?? 0;
  const allAssignments =
    getPositionAssignments({ structureId: structure?.structureId, drawDefinition }).positionAssignments ?? [];
  const positionAssignments = matchUp.sides ? [] : allAssignments;
  const required =
    count === 2 ||
    (!!matchUp.collectionId && isAdHoc({ structure }) && count >= 1) ||
    (assignedDrawPositions?.length === 2 &&
      positionAssignments
        .filter((assignment) => assignedDrawPositions.includes(assignment.drawPosition))
        .every((assignment) => assignment.participantId));

  const feed = feedEligibilityChange({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpStatus: request.matchUpStatus,
    winningSide: request.winningSide,
    structure,
    matchUp,
    score: request.score,
  });

  let line: OutcomeView['line'];
  if (matchUpTieId) {
    const { matchUp: dualMatchUp } = findDrawMatchUp({
      matchUpId: matchUpTieId,
      inContext: true,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (dualMatchUp) {
      const tieFormat = resolveTieFormat({ matchUp: dualMatchUp, drawDefinition, structure, event })?.tieFormat;
      const { projectedWinningSide } = getProjectedDualWinningSide({
        matchUpStatus: request.matchUpStatus,
        winningSide: request.winningSide,
        score: request.score,
        drawDefinition,
        dualMatchUp,
        matchUpsMap,
        tieFormat,
        structure,
        matchUp,
        event,
      });
      line = {
        dualMatchUpId: matchUpTieId,
        dualMatchUpStatus: dualMatchUp.matchUpStatus,
        dualWinningSide: dualMatchUp.winningSide,
        projectedWinningSide,
        autoCalcDisabled: !!(dualMatchUp.disableAutoCalc ?? dualMatchUp._disableAutoCalc),
      };
    }
  }

  let dualProjection: OutcomeView['dualProjection'];
  if (isTeam && request.flags.enableAutoCalc) {
    // v1 hands the generator the raw matchUp; the same input keeps the projection identical
    const { winningSide } = generateTieMatchUpScore({
      matchUp: matchUp as HydratedMatchUp,
      drawDefinition,
      matchUpsMap,
      structure,
      event,
    });
    dualProjection = { projectedWinningSide: winningSide };
  }

  return {
    ...empty,
    found: true,
    isTeam,
    matchUpTieId,
    existing: {
      matchUpStatus: matchUp.matchUpStatus,
      matchUpStatusCodes: matchUp.matchUpStatusCodes,
      winningSide: matchUp.winningSide,
      score: matchUp.score,
      scoreHasValue: !!checkScoreHasValue({ score: matchUp.score }),
      scoredTime: !!matchUp.schedule?.scoredTime,
      roundPosition: matchUp.roundPosition,
      collectionId: matchUp.collectionId,
      matchUpFormat: storedFormat,
      ownMatchUpFormat: matchUp.matchUpFormat,
      validWinningScore: !LIVE_OR_UNSET.has(matchUp.matchUpStatus) && validWinningScore,
    },
    impliedWinningSide,
    propagatedExitStands,
    activeDownstream,
    participants: {
      required: !!required,
      count,
      exitAwardable: exitAwardable(allAssignments, inContextMatchUp, request.winningSide),
      requireForScoring,
    },
    feedEligibilityBlockedBy: feed?.sourceRoundMatchUpId,
    line,
    dualProjection,
    targets: {
      winnerMatchUpId: targetData?.targetMatchUps?.winnerMatchUp?.matchUpId,
      loserMatchUpId: targetData?.targetMatchUps?.loserMatchUp?.matchUpId,
      luckyPreFeed: luckyPreFeed(drawDefinition, matchUp, structure),
      sideParticipantIds: {
        1: inContextMatchUp?.sides?.find((side) => side.sideNumber === 1)?.participantId,
        2: inContextMatchUp?.sides?.find((side) => side.sideNumber === 2)?.participantId,
      },
      sideDrawPositions: {
        1: inContextMatchUp?.sides?.find((side) => side.sideNumber === 1)?.drawPosition,
        2: inContextMatchUp?.sides?.find((side) => side.sideNumber === 2)?.drawPosition,
      },
      loserLink: targetData?.targetLinks?.loserTargetLink
        ? {
            linkCondition: targetData.targetLinks.loserTargetLink.linkCondition,
            targetRoundNumber: targetData.targetLinks.loserTargetLink.target?.roundNumber,
          }
        : undefined,
      loserMatchUpRoundNumber: targetData?.targetMatchUps?.loserMatchUp?.roundNumber,
      priorWins: priorWins(inContextDrawMatchUps, inContextMatchUp),
    },
    draw: {
      isAdHoc: !!isAdHoc({ structure }),
      teamRoundRobin: !!(matchUp.tieMatchUps && !matchUp.roundPosition && inContextMatchUp?.containerStructureId),
      includesBye: !!matchUp.drawPositions?.some((position) =>
        allAssignments.some((assignment) => assignment.bye && assignment.drawPosition === position),
      ),
      timedTie: !!(inContextMatchUp?.collectionId && lastSetFormatIsTimed({ ...inContextMatchUp })),
    },
  };
}
