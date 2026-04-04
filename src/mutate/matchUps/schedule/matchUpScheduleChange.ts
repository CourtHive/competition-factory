import { allocateTeamMatchUpCourts } from '@Mutate/matchUps/schedule/allocateTeamMatchUpCourts';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';

// constants
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  ErrorType,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  NO_MODIFICATIONS_APPLIED,
} from '@Constants/errorConditionConstants';

export function matchUpScheduleChange(params) {
  const stack = 'matchUpScheduleChange';
  const { tournamentRecords } = params;
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const { sourceMatchUpContextIds, targetMatchUpContextIds, sourceCourtId, targetCourtId, courtDayDate } = params ?? {};

  const {
    drawId: sourceDrawId,
    matchUpId: sourceMatchUpId,
    tournamentId: sourceTournamentId,
  } = sourceMatchUpContextIds ?? {};

  const {
    drawId: targetDrawId,
    matchUpId: targetMatchUpId,
    tournamentId: targetTournamentId,
  } = targetMatchUpContextIds ?? {};

  if (!sourceMatchUpId && !targetMatchUpId) return decorateResult({ result: { error: MISSING_VALUE }, stack });

  const { matchUps } = allCompetitionMatchUps({
    matchUpFilters: {
      matchUpIds: [sourceMatchUpId, targetMatchUpId].filter(Boolean),
      drawIds: [sourceDrawId, targetDrawId].filter(Boolean),
    },
    tournamentRecords: params.tournamentRecords,
  });

  const sourceMatchUp = matchUps?.find(({ matchUpId }) => matchUpId === sourceMatchUpId);
  const targetMatchUp = matchUps?.find(({ matchUpId }) => matchUpId === targetMatchUpId);

  let matchUpsModified = 0;

  if (targetCourtId && sourceMatchUpId && !targetMatchUpId) {
    const result = assignMatchUp({
      tournamentId: sourceTournamentId,
      matchUpId: sourceMatchUpId,
      courtId: targetCourtId,
      matchUp: sourceMatchUp,
      drawId: sourceDrawId,
      tournamentRecords,
      sourceCourtId,
      courtDayDate,
    });
    if (result?.success) matchUpsModified++;
    if (result.error) return decorateResult({ result, stack });
  } else if (sourceCourtId && targetCourtId && sourceMatchUpId && targetMatchUpId) {
    const sourceResult = assignMatchUp({
      tournamentId: sourceTournamentId,
      matchUpId: sourceMatchUpId,
      courtId: targetCourtId,
      matchUp: sourceMatchUp,
      drawId: sourceDrawId,
      tournamentRecords,
      sourceCourtId,
      courtDayDate,
    });
    if (sourceResult.success) matchUpsModified++;
    if (sourceResult.error) return decorateResult({ result: sourceResult, stack, info: 'source' });

    const targetResult = assignMatchUp({
      tournamentId: targetTournamentId,
      sourceCourtId: targetCourtId,
      matchUpId: targetMatchUpId,
      matchUp: targetMatchUp,
      courtId: sourceCourtId,
      drawId: targetDrawId,
      tournamentRecords,
      courtDayDate,
    });
    if (targetResult.success) matchUpsModified++;
    if (targetResult.error) return decorateResult({ result: targetResult, stack, info: 'target' });
  } else {
    return { error: MISSING_VALUE };
  }

  return matchUpsModified ? SUCCESS : decorateResult({ result: { error: NO_MODIFICATIONS_APPLIED }, stack });

  function assignMatchUp(params): { error?: ErrorType; success?: boolean } {
    const { tournamentRecords, tournamentId, matchUp, drawId } = params;

    const tournamentRecord = tournamentRecords[tournamentId];
    const { drawDefinition } = findDrawDefinition({
      tournamentRecord,
      drawId,
    });

    if (matchUp.matchUpType === TEAM) {
      return allocateCourts({ ...params, tournamentRecord, drawDefinition });
    } else {
      return assignMatchUpCourt({
        ...params,
        tournamentRecord,
        drawDefinition,
      });
    }
  }

  function allocateCourts({
    removePriorValues,
    tournamentRecords,
    tournamentRecord,
    drawDefinition,
    sourceCourtId,
    courtDayDate,
    matchUpId,
    matchUp,
    courtId,
  }) {
    const courtIds = [courtId].concat(
      matchUp.schedule.allocatedCourts.map(({ courtId }) => courtId).filter((courtId) => courtId !== sourceCourtId),
    );
    return allocateTeamMatchUpCourts({
      removePriorValues,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      courtDayDate,
      matchUpId,
      courtIds,
    });
  }
}
