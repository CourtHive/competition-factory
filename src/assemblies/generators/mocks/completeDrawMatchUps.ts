import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { assignTieMatchUpParticipantId } from '@Mutate/matchUps/lineUps/assignTieMatchUpParticipant';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { generateLineUps } from '@Assemblies/generators/participants/generateLineUps';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getParticipants } from '@Query/participants/getParticipants';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { structureSort } from '@Functions/sorters/structureSort';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { getMatchUpId } from '@Functions/global/extractors';
import { generateOutcome } from './generateOutcome';
import { intersection } from '@Tools/arrays';

// constants and types
import { BYE, COMPLETED, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { MAIN, PLAY_OFF, QUALIFYING, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { ErrorType, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { addExtension } from '@Mutate/extensions/addExtension';
import { LINEUPS } from '@Constants/extensionConstants';
import { ASCENDING } from '@Constants/sortingConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { RANKING } from '@Constants/scaleConstants';

// Helper to assign participants for dual matchups
function assignParticipantsToDualMatchUps({ firstRoundDualMatchUps, event, tournamentRecord, drawDefinition }) {
  const categoryName = event?.category?.ageCategoryCode || event?.category?.categoryName;
  if (categoryName) {
    const scaleAccessor = {
      scaleName: categoryName,
      sortOrder: ASCENDING,
      scaleType: RANKING,
    };
    const result = generateLineUps({
      singlesOnly: true,
      tournamentRecord,
      drawDefinition,
      scaleAccessor,
      event,
    });
    if (result.error) return result;
    const { lineUps, participantsToAdd } = result;
    addParticipants({ tournamentRecord, participants: participantsToAdd });
    const extension = { name: LINEUPS, value: lineUps };
    addExtension({ element: drawDefinition, extension });
    return undefined;
  }
  const structureId = firstRoundDualMatchUps[0]?.structureId;
  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structureId,
  });

  if (!positionAssignments?.length) return;
  const { participants: teamParticipants } = getParticipants({
    participantFilters: { participantTypes: [TEAM] },
    tournamentRecord,
  });

  function findTeamParticipantByDrawPosition(drawPosition) {
    return teamParticipants?.find((teamParticipant) => {
      const { participantId } = teamParticipant;
      const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
      return assignment?.drawPosition === drawPosition;
    });
  }

  function assignSinglesMatchUpParticipants(singlesMatchUp, i, tieMatchUpId) {
    singlesMatchUp.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = findTeamParticipantByDrawPosition(drawPosition);

      if (teamParticipant) {
        const individualParticipantId = teamParticipant.individualParticipantIds?.[i];

        if (individualParticipantId) {
          assignTieMatchUpParticipantId({
            teamParticipantId: teamParticipant.participantId,
            participantId: individualParticipantId,
            tournamentRecord,
            drawDefinition,
            tieMatchUpId,
            event,
          });
        }
        return undefined;
      }
    });
  }

  function assignDoublesMatchUpParticipants(doublesMatchUp, i, tieMatchUpId) {
    doublesMatchUp.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = findTeamParticipantByDrawPosition(drawPosition);

      if (teamParticipant) {
        const individualParticipantIds = teamParticipant.individualParticipantIds?.slice(i * 2, i * 2 + 2);
        individualParticipantIds?.forEach((individualParticipantId) => {
          assignTieMatchUpParticipantId({
            teamParticipantId: teamParticipant.participantId,
            participantId: individualParticipantId,
            tournamentRecord,
            drawDefinition,
            tieMatchUpId,
            event,
          });
        });
      }
    });
  }

  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(isMatchUpEventType(SINGLES));
    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(isMatchUpEventType(DOUBLES));

    singlesMatchUps.forEach((singlesMatchUp, i) => {
      const tieMatchUpId = singlesMatchUp.matchUpId;
      assignSinglesMatchUpParticipants(singlesMatchUp, i, tieMatchUpId);
    });

    doublesMatchUps.forEach((doublesMatchUp, i) => {
      const tieMatchUpId = doublesMatchUp.matchUpId;
      assignDoublesMatchUpParticipants(doublesMatchUp, i, tieMatchUpId);
    });
  });
  return undefined;
}

// Helper to complete matchups for a structure
function completeStructureMatchUps({
  structure,
  matchUpsMap,
  drawDefinition,
  tournamentRecord,
  event,
  matchUpStatusProfile,
  matchUpFormat,
  matchUpStatus,
  scoreString,
  randomWinningSide,
  completionGoal,
  completedCount,
}) {
  const matchUps = getAllStructureMatchUps({
    contextFilters: { matchUpTypes: [DOUBLES, SINGLES] },
    afterRecoveryTimes: false,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  }).matchUps;

  const sortedMatchUpIds = matchUps
    .filter(({ winningSide }) => !winningSide)
    .sort(matchUpSort)
    .map(getMatchUpId);

  for (const matchUpId of sortedMatchUpIds) {
    if (!Number.isNaN(Number(completionGoal)) && completedCount.value >= completionGoal) break;

    const { matchUps } = getAllStructureMatchUps({
      matchUpFilters: { matchUpTypes: [DOUBLES, SINGLES] },
      afterRecoveryTimes: false,
      tournamentRecord,
      inContext: true,
      drawDefinition,
      matchUpsMap,
      structure,
      event,
    });

    const targetMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

    const isDoubleExit = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(targetMatchUp.matchUpStatus);

    if (targetMatchUp?.readyToScore && !isDoubleExit) {
      const winningSide = !randomWinningSide && 1;
      const result = smartComplete({
        matchUpStatusProfile,
        tournamentRecord,
        drawDefinition,
        targetMatchUp,
        matchUpFormat,
        matchUpStatus,
        scoreString,
        winningSide,
        event,
      });

      if (result?.error) return result;

      completedCount.value += 1;
    }
  }
  return undefined;
}

export function completeDrawMatchUps(params): {
  completeRoundRobinPlayoffs?: boolean;
  completedCount?: number;
  success?: boolean;
  error?: ErrorType;
} {
  const {
    matchUpStatusProfile,
    completeAllMatchUps,
    randomWinningSide,
    tournamentRecord,
    completionGoal,
    drawDefinition,
    event,
  } = params;

  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const matchUpFormat = params.matchUpFormat || drawDefinition.matchUpFormat || event?.matchUpFormat;
  const sortedStructures = drawDefinition.structures.slice().sort(structureSort);
  const completedCount = { value: 0 };

  const { matchUps: firstRoundDualMatchUps, matchUpsMap } = getAllDrawMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    contextFilters: { stages: [MAIN, QUALIFYING] },
    inContext: true,
    drawDefinition,
  });

  if (firstRoundDualMatchUps?.length) {
    const result = assignParticipantsToDualMatchUps({
      firstRoundDualMatchUps,
      event,
      tournamentRecord,
      drawDefinition,
    });
    if (result?.error) return result;
  }

  const scoreString = typeof completeAllMatchUps === 'string' && completeAllMatchUps;
  const matchUpStatus = scoreString && COMPLETED;

  const isRoundRobinWithPlayoff =
    sortedStructures.length === 2 &&
    sortedStructures[0].finishingPosition === WIN_RATIO &&
    intersection(
      sortedStructures.map(({ stage }) => stage),
      [MAIN, PLAY_OFF],
    ).length === 2;

  const structureIds = sortedStructures.map(({ structureId }) => structureId);

  for (const structureId of structureIds) {
    if (completedCount.value >= completionGoal) break;
    const structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);

    const result = completeStructureMatchUps({
      structure,
      matchUpsMap,
      drawDefinition,
      tournamentRecord,
      event,
      matchUpStatusProfile,
      matchUpFormat,
      matchUpStatus,
      scoreString,
      randomWinningSide,
      completionGoal,
      completedCount,
    });
    if (result?.error) return result;

    if (isRoundRobinWithPlayoff && structure.finishingPosition === WIN_RATIO && params.completeRoundRobinPlayoffs) {
      automatedPlayoffPositioning({
        structureId: structure.structureId,
        applyPositioning: true,
        drawDefinition,
      });
    }
  }

  return { ...SUCCESS, completedCount: completedCount.value };
}

export function completeDrawMatchUp(params) {
  const {
    matchUpStatusCodes,
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    targetMatchUp,
    matchUpStatus,
    matchUpFormat,
    scoreString,
    winningSide,
    event,
  } = params;
  if (!targetMatchUp || targetMatchUp.matchUpStatus === BYE) {
    return;
  }
  const { matchUpId } = targetMatchUp || {};

  const { outcome } = generateOutcomeFromScoreString({
    matchUpFormat,
    matchUpStatus,
    scoreString,
    winningSide,
  });

  if (matchUpStatusCodes) outcome.matchUpStatusCodes = matchUpStatusCodes;

  return setMatchUpStatus({
    tournamentRecord,
    policyDefinitions,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    outcome,
    event,
  });
}

// NOTE: matchUpFormat must come from collectionDefinition in TEAM events
function smartComplete(params) {
  const {
    matchUpStatusProfile = {},
    tournamentRecord,
    policyDefinitions,
    drawDefinition,
    matchUpStatus,
    matchUpFormat,
    targetMatchUp,
    scoreString,
    winningSide,
    event,
  } = params;

  const resolvedFormat = targetMatchUp?.matchUpFormat || matchUpFormat;

  if (scoreString || matchUpStatus) return completeDrawMatchUp({ ...params, matchUpFormat: resolvedFormat });

  const { matchUpId } = targetMatchUp || {};
  const { outcome } = generateOutcome({
    matchUpStatusProfile,
    matchUpFormat: resolvedFormat,
    winningSide,
  });

  return setMatchUpStatus({
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    matchUpFormat: resolvedFormat,
    matchUpId,
    outcome,
    event,
  });
}
