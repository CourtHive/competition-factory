import { getIndividualParticipants } from '@Query/matchUp/getIndividualParticipants';
import { extractTime, sameDay, timeStringMinutes } from '@Tools/dateTime';

// constants and types
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { PersonRequests } from '@Types/factoryTypes';

/**
 * The person requests a matchUp placed at `scheduleTime` on `scheduleDate` would break, and the record of them.
 *
 * `requestConflicts` is keyed by date: each date holds one entry per request a placement broke, `{ request,
 * scheduleTimes, matchUpIds }`, the slots refused and the matchUps they were refused for. A request is for one date, so
 * its entry is found among that date's alone.
 *
 * @param {string} scheduleDate - 'YYYY-MM-DD' date string
 * @param {object} matchUp - matchUp being checked
 * @param {string} scheduleTime - time being checked
 * @param {number} averageMatchUpMinutes - number of minutes matchUp is expected to last
 * @param {object} requestConflicts - { [scheduleDate]: [{ request, scheduleTimes, matchUpIds }] }
 * @param {boolean} potentials - whether to consider potential participants when determining conflicts
 * @param {object} personRequests - contains personRequests { [personId]: [request] }
 */
/** a request a placement broke: the request (with the person it is for), the slots refused and the matchUps they were
 * refused for */
export type RequestConflict = {
  request: PersonRequests[string][number] & { personId: string };
  scheduleTimes: string[];
  matchUpIds: string[];
};

export function checkRequestConflicts({
  averageMatchUpMinutes = 90,
  requestConflicts = {},
  potentials = true,
  personRequests,
  scheduleTime,
  scheduleDate,
  matchUp,
}) {
  const personIds = getIndividualParticipants(matchUp).map(({ person }) => person?.personId);
  if (potentials) {
    // a DOUBLES potential is a pair: its people are its individual participants (R4)
    const potentialPersonIds = (matchUp?.potentialParticipants ?? [])
      .flat()
      .flatMap((participant) =>
        participant?.individualParticipants?.length
          ? participant.individualParticipants.map((individual) => individual?.person?.personId)
          : [participant?.person?.personId],
      );
    personIds.push(...potentialPersonIds);
  }

  const relevantPersonRequests = personIds
    .map((personId) => personRequests[personId]?.map((request) => ({ ...request, personId })))
    .filter(Boolean)
    .flat()
    .filter((request) => request.requestType === DO_NOT_SCHEDULE && sameDay(scheduleDate, request.date));

  const conflicts: any[] = [];
  const matchUpId = matchUp?.matchUpId;
  // minutes from midnight, so a matchUp running past midnight is not wrapped back to the start of the day
  const matchUpStart = timeStringMinutes(extractTime(scheduleTime));
  const matchUpEnd = matchUpStart + averageMatchUpMinutes;

  // a request conflicts when its window and the matchUp's projected window overlap at all: the request may hold the
  // matchUp's start or end, or lie wholly inside it
  for (const request of relevantPersonRequests) {
    const { requestId, startTime, endTime } = request;
    const conflict = matchUpStart < timeStringMinutes(endTime) && matchUpEnd > timeStringMinutes(startTime);
    if (conflict) {
      conflicts.push({ matchUpId, request, scheduleTime });
      requestConflicts[scheduleDate] ??= [];
      const dateConflicts: RequestConflict[] = requestConflicts[scheduleDate];
      const recorded = dateConflicts.find((entry) => entry.request.requestId === requestId);
      if (recorded) {
        if (!recorded.scheduleTimes.includes(scheduleTime)) recorded.scheduleTimes.push(scheduleTime);
        if (!recorded.matchUpIds.includes(matchUpId)) recorded.matchUpIds.push(matchUpId);
      } else {
        dateConflicts.push({ request, scheduleTimes: [scheduleTime], matchUpIds: [matchUpId] });
      }
    }
  }

  return { conflicts };
}
