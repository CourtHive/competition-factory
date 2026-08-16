import { updateAssignmentParticipantResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { deleteMatchUpsNotice, modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAdHocStructureDetails } from './getAdHocStructureDetails';
import { getMissingSequenceNumbers, unique } from '@Tools/arrays';
import { getMatchUpId } from '@Functions/global/extractors';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { xa } from '@Tools/extractAttributes';

// constants and types
import { ARRAY, DRAW_DEFINITION, INVALID, MATCHUP_IDS, OF_TYPE, ONE_OF } from '@Constants/attributeConstants';
import { INVALID_VALUES, SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type DeleteAdHocMatchUpsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removeUnAssigned?: boolean; // defaults to true
  removeIncomplete?: boolean; // defaults to false
  removeCompleted?: boolean; // defaults to false
  roundNumbers?: number[];
  matchUpIds?: string[];
  structureId?: string;
  event?: Event;
};
export function deleteAdHocMatchUps(params: DeleteAdHocMatchUpsArgs): ResultType & {
  deletedMatchUpsCount?: number;
} {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true },
    {
      [ONE_OF]: { [MATCHUP_IDS]: false, roundNumbers: false },
      [INVALID]: INVALID_VALUES,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const {
    removeIncomplete = false,
    removeUnAssigned = true,
    removeCompleted = false,
    tournamentRecord,
    drawDefinition,
    event,
  } = params;

  const structureResult = getAdHocStructureDetails(params);
  if (structureResult.error) return structureResult;

  const { structure, structureId, existingMatchUps, matchUpIds } = structureResult;

  const matchUpIdsWithScoreValue: string[] = [];
  const matchUpsToDelete =
    existingMatchUps?.filter(({ matchUpId, score, winningSide }) => {
      if (winningSide && !removeCompleted) return false;
      if (winningSide || checkScoreHasValue({ score })) {
        if (!winningSide && !removeIncomplete) return false;
        matchUpIdsWithScoreValue.push(matchUpId);
      } else if (!removeUnAssigned) return false;
      return matchUpIds?.includes(matchUpId);
    }) ?? [];
  const matchUpIdsToDelete = matchUpsToDelete.map(getMatchUpId);
  const tieMatchUpIdsToDelete: string[] = matchUpsToDelete
    .map(({ tieMatchUps }) => tieMatchUps?.map(getMatchUpId))
    .filter(Boolean)
    .flat();

  if (matchUpIdsToDelete.length) {
    structure.matchUps = (structure.matchUps ?? []).filter(({ matchUpId }) => !matchUpIdsToDelete.includes(matchUpId));

    deleteMatchUpsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUpIds: [...tieMatchUpIdsToDelete, ...matchUpIdsToDelete],
      action: 'deleteAdHocMatchUps',
      eventId: event?.eventId,
      drawDefinition,
    });

    const roundNumbers = unique(structure.matchUps.map(xa('roundNumber')));
    const missingRoundNumbers = getMissingSequenceNumbers(roundNumbers);
    if (missingRoundNumbers.length) {
      missingRoundNumbers.reverse();
      for (const roundNumber of missingRoundNumbers) {
        structure.matchUps.forEach((matchUp) => {
          if (matchUp.roundNumber && matchUp.roundNumber > roundNumber) {
            matchUp.roundNumber -= 1;
            modifyMatchUpNotice({
              tournamentId: tournamentRecord?.tournamentId,
              context: ['adHoc round deletion'],
              eventId: event?.eventId,
              event,
              drawDefinition,
              matchUp,
            });
          }
        });
      }
    }

    if (matchUpIdsWithScoreValue.length) {
      structure.positionAssignments = unique(
        structure.matchUps
          .flatMap((matchUp) => (matchUp.sides ?? []).map((side) => side.participantId))
          .filter(Boolean),
      ).map((participantId) => ({ participantId }));

      const matchUpFormat = structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat;

      const isDualMatchUp = structureResult.existingMatchUps.some((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
      const matchUpFilters = isDualMatchUp ? { matchUpTypes: [TEAM_MATCHUP] } : undefined;
      const { matchUps } = getAllStructureMatchUps({
        afterRecoveryTimes: false,
        inContext: true,
        matchUpFilters,
        structure,
        event,
      });

      const isAdHocStructure = isAdHoc({ structure });
      if (isAdHocStructure) {
        structure.positionAssignments = unique(
          matchUps.flatMap((matchUp) => (matchUp.sides ?? []).map((side) => side.participantId)).filter(Boolean),
        ).map((participantId) => ({ participantId }));
      }

      const result = updateAssignmentParticipantResults({
        positionAssignments: structure.positionAssignments,
        tournamentRecord,
        drawDefinition,
        matchUpFormat,
        matchUps,
        event,
      });
      if (result.error) console.log(result);
    }

    modifyDrawNotice({
      structureIds: [structureId],
      eventId: event?.eventId,
      drawDefinition,
    });
  }

  if (!matchUpIdsToDelete.length && matchUpIds.length) return { error: SCORES_PRESENT };

  return { ...SUCCESS, deletedMatchUpsCount: [...matchUpIdsToDelete, ...tieMatchUpIdsToDelete].length };
}
