import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants and types
import { TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { TournamentRecords } from '@Types/factoryTypes';

type Aggregator = {
  tournamentIdMap: { [key: string]: string[] };
  eventIds: string[];
  drawIds: string[];
};

type AggregatorResut = {
  tournamentIdMap?: { [key: string]: string[] };
  eventIds?: string[];
  drawIds?: string[];
  error?: ErrorType;
};

// Returns arrays of all drawIds and eventIds across tournamentRecords
// Returns an combined array of drawIds and eventIds for each tournamentId
export function getEventIdsAndDrawIds(params: { tournamentRecords: TournamentRecords }): AggregatorResut {
  const paramCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true }]);
  if (paramCheck.error) return paramCheck;

  const tournamentIds = Object.keys(params.tournamentRecords);

  return tournamentIds.reduce(
    (aggregator: Aggregator, tournamentId) => {
      aggregator.tournamentIdMap[tournamentId] = [];

      const tournamentRecord = params.tournamentRecords[tournamentId];
      const events = tournamentRecord.events ?? [];
      const eventIds = events.map(({ eventId }) => eventId);
      const drawIds = events.map((event) => (event.drawDefinitions ?? []).map(({ drawId }) => drawId)).flat();

      aggregator.tournamentIdMap[tournamentId].push(...eventIds, ...drawIds);
      aggregator.eventIds.push(...eventIds);
      aggregator.drawIds.push(...drawIds);

      return aggregator;
    },
    { eventIds: [], drawIds: [], tournamentIdMap: {} },
  );
}
