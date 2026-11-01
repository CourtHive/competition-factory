import { eventDateResolver, EventDateReason } from '@Query/events/eventPlaysOnDate';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { INVALID_DATE, INVALID_VALUES, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { ResultType, TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export type EventDateIssue = {
  scheduledDate: string;
  reason: EventDateReason;
  tournamentId: string;
  matchUpId: string;
  eventId: string;
};

type GetEventDateIssuesArgs = {
  tournamentRecords: TournamentRecords;
  scheduledDate?: string;
  matchUpIds?: string[];
};

/**
 * The scheduled matchUps whose event does not play on their scheduled day (`eventPlaysOnDate`): the derived,
 * persistent warning a schedule grid renders, whoever placed the matchUp and whenever the event's dates changed.
 * A matchUp's day is its `scheduledDate`, else the date part of its `scheduledTime`; unscheduled matchUps are not
 * considered. `scheduledDate` and `matchUpIds` narrow the matchUps considered.
 */
export function getEventDateIssues(
  params: GetEventDateIssuesArgs,
): ResultType & { eventDateIssues?: EventDateIssue[] } {
  const { tournamentRecords, scheduledDate, matchUpIds } = params ?? {};
  if (!tournamentRecords || typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };
  if (matchUpIds !== undefined && !Array.isArray(matchUpIds)) return { error: INVALID_VALUES };
  const date = scheduledDate === undefined ? undefined : extractDate(scheduledDate);
  if (scheduledDate !== undefined && !date) return { error: INVALID_DATE };

  const matchUps =
    allCompetitionMatchUps({
      matchUpFilters: matchUpIds ? { matchUpIds } : undefined,
      tournamentRecords,
    }).matchUps ?? [];

  const resolve = eventDateResolver(tournamentRecords);
  const eventDateIssues: EventDateIssue[] = [];

  for (const matchUp of matchUps) {
    const schedule = matchUp.schedule ?? {};
    const day = extractDate(schedule.scheduledDate) || extractDate(schedule.scheduledTime);
    if (!day || (date && day !== date)) continue;

    const { tournamentId, eventId, matchUpId } = matchUp;
    const verdict = resolve({ tournamentId, eventId, date: day });
    if (!verdict.plays)
      eventDateIssues.push({ matchUpId, eventId, tournamentId, scheduledDate: day, reason: verdict.reason });
  }

  return { ...SUCCESS, eventDateIssues };
}
