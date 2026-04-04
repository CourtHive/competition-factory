import { deleteMatchUpsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getMatchUpId } from '@Functions/global/extractors';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { numericSort } from '@Tools/sorting';

// constants and types
import { INVALID_STRUCTURE, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, DRAW_DEFINITION } from '@Constants/attributeConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type RemoveRoundMatchUpsArgs = {
  removeCompletedMatchUps?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  roundNumber: number;
  event: Event;
};
export function removeRoundMatchUps({
  removeCompletedMatchUps,
  tournamentRecord,
  drawDefinition,
  structureId,
  roundNumber,
  event,
}: RemoveRoundMatchUpsArgs): ResultType & {
  deletedMatchUpsCount?: number;
  roundRemoved?: boolean;
} {
  const paramsCheck = requireParams({ tournamentRecord, drawDefinition }, [TOURNAMENT_RECORD, DRAW_DEFINITION]);
  if (paramsCheck.error) return paramsCheck;
  if (!roundNumber)
    return decorateResult({
      result: { error: MISSING_VALUE },
      info: 'roundNumber required',
    });

  const structureResult = findStructure({ drawDefinition, structureId });
  if (structureResult.error) return structureResult;

  const structure = structureResult.structure;
  // cannot be a round robin structure
  if (structure?.structures) return { error: INVALID_STRUCTURE };

  const isAdHocStructure = isAdHoc({ structure });

  if (isAdHocStructure) {
    return removeAdHocRound({
      tournamentId: tournamentRecord.tournamentId,
      removeCompletedMatchUps,
      eventId: event.eventId,
      drawDefinition,
      roundNumber,
      structure,
    });
  } else {
    console.log('not implemented');
  }

  return { ...SUCCESS };
}

function removeAdHocRound({
  removeCompletedMatchUps,
  drawDefinition,
  tournamentId,
  roundNumber,
  structure,
  eventId,
}): ResultType & { deletedMatchUpsCount?: number; roundRemoved?: boolean } {
  const matchUps = structure?.matchUps ?? [];
  const deletedTieMatchUpIds: string[] = [];
  const deletedMatchUpIds: string[] = [];
  let roundRemoved = false;

  const roundNumbers: number[] = matchUps
    .reduce((nums: number[], matchUp) => {
      const roundNumber = matchUp?.roundNumber;
      if (!roundNumber) return nums;
      return nums.includes(roundNumber) ? nums : nums.concat(roundNumber);
    }, [])
    .sort(numericSort);
  if (roundNumbers.includes(roundNumber)) {
    const updatedMatchUps = matchUps.filter((matchUp) => {
      const target =
        matchUp.roundNumber === roundNumber &&
        (!completedMatchUpStatuses.includes(matchUp.matchUpStatus) || removeCompletedMatchUps);
      if (target) {
        deletedMatchUpIds.push(matchUp.matchUpId);
        if (matchUp.tieMatchUps) {
          deletedTieMatchUpIds.push(...matchUp.tieMatchUps.map(getMatchUpId));
        }
      }

      return !target;
    });

    if (deletedMatchUpIds.length) {
      deleteMatchUpsNotice({
        matchUpIds: [...deletedTieMatchUpIds, ...deletedMatchUpIds],
        drawDefinition,
        tournamentId,
        eventId,
      });

      const stillContainsRoundNumber = updatedMatchUps.some((matchUp) => matchUp.roundNumber === roundNumber);

      if (!stillContainsRoundNumber) {
        updatedMatchUps.forEach((matchUp) => {
          if (matchUp.roundNumber > roundNumber) {
            matchUp.roundNumber -= 1;

            modifyMatchUpNotice({
              drawDefinition,
              tournamentId,
              eventId,
              matchUp,
            });
          }
        });
        roundRemoved = true;
      }

      structure.matchUps = updatedMatchUps;
    }
  }

  return {
    deletedMatchUpsCount: deletedMatchUpIds.length,
    roundRemoved,
    ...SUCCESS,
  };
}
