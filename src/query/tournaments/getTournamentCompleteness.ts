import { getEventCompleteness } from '@Query/event/getEventCompleteness';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

// getTournamentCompleteness is the top layer of the completeness roll-up: it aggregates
// getEventCompleteness across the tournament's events, preserving the per-event breakdown.

export type TournamentCompleteness = {
  tournamentId?: string;
  unassignedPositionCount: number;
  unplayedMatchUpCount: number;
  byEvent: any[];
};

type GetTournamentCompletenessArgs = {
  tournamentRecord?: Tournament;
};

export function getTournamentCompleteness(
  params: GetTournamentCompletenessArgs,
): ResultType & { complete?: boolean; completeness?: TournamentCompleteness } {
  const { tournamentRecord } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const tournamentId = tournamentRecord.tournamentId;

  const byEvent = (tournamentRecord.events ?? []).map((event) => {
    const result: any = getEventCompleteness({ event, tournamentRecord });
    return { eventId: event.eventId, complete: result.complete, completeness: result.completeness };
  });

  const unassignedPositionCount = byEvent.reduce(
    (sum, event) => sum + (event.completeness?.unassignedPositionCount ?? 0),
    0,
  );
  const unplayedMatchUpCount = byEvent.reduce((sum, event) => sum + (event.completeness?.unplayedMatchUpCount ?? 0), 0);
  const complete = unassignedPositionCount === 0 && unplayedMatchUpCount === 0;

  return {
    ...SUCCESS,
    complete,
    completeness: { tournamentId, unassignedPositionCount, unplayedMatchUpCount, byEvent },
  };
}
