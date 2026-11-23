import { decorateResult } from '@Functions/global/decorateResult';
import { findTournamentId } from './findTournamentId';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { findEvent } from './findEvent';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION_NOT_FOUND,
  ErrorType,
  MISSING_DRAW_ID,
  MISSING_TOURNAMENT_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type GetDrawDefinitionArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  tournamentId?: string;
  drawId: string;
};

export function findDrawDefinition({
  tournamentRecords,
  tournamentRecord,
  tournamentId,
  drawId,
}: GetDrawDefinitionArgs): {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  error?: ErrorType;
  event?: Event;
} {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!drawId) return { error: MISSING_DRAW_ID };

  if (!tournamentRecord && tournamentRecords) {
    if (typeof tournamentId !== 'string') {
      // find tournamentId by brute force if not provided
      tournamentId = findTournamentId({ tournamentRecords, drawId });
      if (!tournamentId) return { error: MISSING_TOURNAMENT_ID };
    }

    tournamentRecord = tournamentRecords[tournamentId];
    if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  }

  const result = tournamentRecord && findEvent({ tournamentRecord, drawId });
  if (!result?.drawDefinition) {
    return decorateResult({
      result: { error: DRAW_DEFINITION_NOT_FOUND },
      stack: 'findDrawDefinition',
    });
  }

  return {
    drawDefinition: result.drawDefinition,
    event: result.event,
    tournamentRecord,
    ...SUCCESS,
  };
}

export function publicFindDrawDefinition(params: GetDrawDefinitionArgs) {
  const { drawDefinition, error } = findDrawDefinition(params);
  if (error) return { error };
  return { drawDefinition: makeDeepCopy(drawDefinition) };
}
