import { eventPlaysOnDate, EventDateReason } from '@Query/events/eventPlaysOnDate';
import { canonicalDate } from '@Tools/canonicalClock';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { EVENT_DATE_INACTIVE } from '@Constants/errorConditionConstants';

export type EventDateWarning = typeof EVENT_DATE_INACTIVE & {
  reason: EventDateReason;
  scheduledDate: string;
  matchUpId?: string;
  eventId?: string;
};

type EventDateWarningArgs = {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  scheduledDate?: string;
  matchUpId?: string;
  event?: Event;
};

/** The event a draw belongs to, when the caller did not pass it. */
export function eventOfDraw(tournamentRecord?: Tournament, drawDefinition?: DrawDefinition): Event | undefined {
  const drawId = drawDefinition?.drawId;
  if (!drawId) return undefined;
  return tournamentRecord?.events?.find((event) =>
    event.drawDefinitions?.some((candidate) => candidate.drawId === drawId),
  );
}

/**
 * The `EVENT_DATE_INACTIVE` warning for a manual placement on a day its event does not play, or undefined when the
 * event plays that day (or there is no day to judge). A manual placement always lands: this is a warning, never a
 * refusal (CA 2026-11-01).
 */
export function eventDateWarning({
  tournamentRecord,
  drawDefinition,
  scheduledDate,
  matchUpId,
  event,
}: EventDateWarningArgs): EventDateWarning | undefined {
  const date = canonicalDate(scheduledDate);
  if (!date || !tournamentRecord) return undefined;

  const matchUpEvent = event ?? eventOfDraw(tournamentRecord, drawDefinition);
  const verdict = eventPlaysOnDate({ tournamentRecord, event: matchUpEvent, date });
  if (verdict.plays) return undefined;

  return {
    ...EVENT_DATE_INACTIVE,
    eventId: matchUpEvent?.eventId,
    reason: verdict.reason,
    scheduledDate: date,
    matchUpId,
  };
}
