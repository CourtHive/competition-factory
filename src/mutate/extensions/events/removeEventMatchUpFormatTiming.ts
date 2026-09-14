import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { removeEventExtension } from '@Mutate/extensions/addRemoveExtensions';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { EVENT_ID, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { EVENT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';

type RemoveEventMatchUpFormatTimingArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  eventId: string;
  event?: Event;
};
export function removeEventMatchUpFormatTiming(params: RemoveEventMatchUpFormatTimingArgs) {
  if (params.event) {
    return removeTiming({ event: params.event });
  } else {
    if (params.tournamentRecord && !params.tournamentRecords) {
      params.tournamentRecords = {
        [params.tournamentRecord.tournamentId]: params.tournamentRecord,
      };
    }
    const paramCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true, [EVENT_ID]: true }]);
    if (paramCheck.error) return paramCheck;

    const { tournamentRecords, eventId } = params;
    for (const tournamentRecord of Object.values(tournamentRecords ?? {})) {
      const { event } = findEvent({ tournamentRecord, eventId });
      if (event) return removeTiming({ event });
    }
  }

  return { error: EVENT_NOT_FOUND };
}

function removeTiming({ event }) {
  return removeEventExtension({ event, name: SCHEDULE_TIMING });
}
