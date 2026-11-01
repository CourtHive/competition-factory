import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { zeroPad } from '@Tools/dateTime';

// types
import { TournamentRecords } from '@Types/factoryTypes';
import type { SchedulingView } from './view';
import type { SchedulePlan } from './plan';

/**
 * vNext, the WRITE: applies a plan to the records, and is the only stage that writes. Each placement is a date, a time
 * and a venue, written as v1 writes them (separate timeItems, so the time stays plain HH:mm). The played order is not
 * asked here: the plan was made by its gate, and the guard (`planPlayedOrderRefusal`) judged the whole plan before this
 * runs (spec § 3.7).
 *
 * `tournamentRecords` are the records written: the view's, unless the plan was made on a working copy (a cleared
 * date is planned on a copy cleared first, so a refusal leaves the stored records untouched).
 *
 * Reports what was written: per date, the matchUps placed, and the matchUps left without a time: those the plan left
 * without one, and those whose date the write refused (a profile date outside the tournament's dates). A refused date
 * writes nothing for that matchUp, so it is never left with a time and no date.
 */
type ByDate<T> = { [scheduleDate: string]: T };
type WritePlanArgs = { plan: SchedulePlan; view: SchedulingView; tournamentRecords?: TournamentRecords };

export function writePlan({ plan, view, tournamentRecords = view.tournamentRecords }: WritePlanArgs) {
  const scheduledMatchUpIds: ByDate<string[]> = {};
  const noTimeMatchUpIds: ByDate<string[]> = {};

  for (const { scheduleDate, venues } of view.dates) {
    scheduledMatchUpIds[scheduleDate] = [];
    noTimeMatchUpIds[scheduleDate] = [...(plan.noTimeMatchUpIds[scheduleDate] ?? [])];
    for (const { venueId } of venues) {
      for (const { matchUpId, scheduleTime } of plan.placements[scheduleDate]?.[venueId] ?? []) {
        const written = writePlacement({ view, tournamentRecords, matchUpId, scheduleDate, scheduleTime, venueId });
        if (written === WRITTEN) scheduledMatchUpIds[scheduleDate].push(matchUpId);
        if (written === DATE_REFUSED) noTimeMatchUpIds[scheduleDate].push(matchUpId);
      }
    }
  }

  return { scheduledMatchUpIds, noTimeMatchUpIds };
}

type WritePlacementArgs = {
  tournamentRecords: TournamentRecords;
  view: SchedulingView;
  scheduleTime: string;
  scheduleDate: string;
  matchUpId: string;
  venueId: string;
};

const WRITTEN = 'WRITTEN';
const DATE_REFUSED = 'DATE_REFUSED';
const NOT_FOUND = 'NOT_FOUND';
const NOT_WRITTEN = 'NOT_WRITTEN';
type PlacementWrite = typeof WRITTEN | typeof DATE_REFUSED | typeof NOT_FOUND | typeof NOT_WRITTEN;

/**
 * One placement; a matchUp whose tournament or draw cannot be found is neither written nor reported, as in v1. The
 * date is written first and its refusal stops the placement: no time and no venue are written without it.
 */
function writePlacement({
  view,
  tournamentRecords,
  matchUpId,
  scheduleDate,
  scheduleTime,
  venueId,
}: WritePlacementArgs): PlacementWrite {
  const matchUp = view.matchUps.get(matchUpId);
  const tournamentRecord = matchUp?.tournamentId ? tournamentRecords[matchUp.tournamentId] : undefined;
  if (!matchUp || !tournamentRecord) return NOT_FOUND;
  const { drawDefinition } = findDrawDefinition({ tournamentRecord, drawId: matchUp.drawId });
  if (!drawDefinition) return NOT_FOUND;

  const scheduledTime = scheduleTime.split(':').map(zeroPad).join(':');

  const dateResult = addMatchUpScheduledDate({
    scheduledDate: scheduleDate,
    playedOrderChecked: true,
    tournamentRecord,
    drawDefinition,
    matchUpId,
  });
  if (dateResult.error) return DATE_REFUSED;
  const result = addMatchUpScheduledTime({ playedOrderChecked: true, scheduledTime, drawDefinition, matchUpId });
  if (!result.success) return NOT_WRITTEN;
  if (venueId) assignMatchUpVenue({ tournamentRecord, drawDefinition, matchUpId, venueId });
  return WRITTEN;
}
