import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { checkPlayedOrder } from '@Mutate/matchUps/schedule/scheduleItems/playedOrder';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { zeroPad } from '@Tools/dateTime';

// types
import type { SchedulingView } from './view';
import type { SchedulePlan } from './plan';

/**
 * vNext, the WRITE: applies a plan to the records, and is the only stage that writes. Each placement is a date, a time
 * and a venue, written as v1 writes them (separate timeItems, so the time stays plain HH:mm). The played order is asked
 * of each placement against the records as the view read them (spec § 5): a placement at or before a played source is
 * refused and reported unplaced, and the rest of the plan is still written, as v1 does.
 *
 * Reports what was written: per date, the matchUps placed, and the matchUps left without a time (each venue's refusals,
 * then the matchUps its slots could not take).
 */
type ByDate<T> = { [scheduleDate: string]: T };

export function writePlan({ plan, view }: { plan: SchedulePlan; view: SchedulingView }) {
  const scheduledMatchUpIds: ByDate<string[]> = {};
  const noTimeMatchUpIds: ByDate<string[]> = {};

  for (const { scheduleDate, venues } of view.dates) {
    scheduledMatchUpIds[scheduleDate] = [];
    noTimeMatchUpIds[scheduleDate] = [];
    for (const { venueId } of venues) {
      for (const { matchUpId, scheduleTime } of plan.placements[scheduleDate]?.[venueId] ?? []) {
        const written = writePlacement({ view, matchUpId, scheduleDate, scheduleTime, venueId });
        if (written === 'refused') noTimeMatchUpIds[scheduleDate].push(matchUpId);
        if (written === 'written') scheduledMatchUpIds[scheduleDate].push(matchUpId);
      }
      noTimeMatchUpIds[scheduleDate].push(...(plan.unplaced[scheduleDate]?.[venueId] ?? []));
    }
  }

  return { scheduledMatchUpIds, noTimeMatchUpIds };
}

type WritePlacementArgs = {
  view: SchedulingView;
  scheduleTime: string;
  scheduleDate: string;
  matchUpId: string;
  venueId: string;
};

/** one placement; a matchUp whose tournament or draw cannot be found is neither written nor reported, as in v1 */
function writePlacement({ view, matchUpId, scheduleDate, scheduleTime, venueId }: WritePlacementArgs) {
  const matchUp = view.matchUps.get(matchUpId);
  const tournamentRecord = matchUp?.tournamentId ? view.tournamentRecords[matchUp.tournamentId] : undefined;
  if (!matchUp || !tournamentRecord) return 'skipped';
  const { drawDefinition } = findDrawDefinition({ tournamentRecord, drawId: matchUp.drawId });
  if (!drawDefinition) return 'skipped';

  const scheduledTime = scheduleTime.split(':').map(zeroPad).join(':');
  const refusal = checkPlayedOrder({
    schedule: { scheduledDate: scheduleDate, scheduledTime },
    matchUpDependencies: view.matchUpDependencies,
    inContextMatchUps: view.hydrated,
    drawDefinition,
    matchUpId,
  });
  if (refusal) return 'refused';

  addMatchUpScheduledDate({
    scheduledDate: scheduleDate,
    playedOrderChecked: true,
    tournamentRecord,
    drawDefinition,
    matchUpId,
  });
  const result = addMatchUpScheduledTime({ playedOrderChecked: true, scheduledTime, drawDefinition, matchUpId });
  if (!result.success) return 'skipped';
  if (venueId) assignMatchUpVenue({ tournamentRecord, drawDefinition, matchUpId, venueId });
  return 'written';
}
