import { getIndividualParticipants } from '@Query/matchUp/getIndividualParticipants';
import { extractTime, sameDay, timeStringMinutes } from '@Tools/dateTime';

// constants
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

/**
 *
 * @param {string} scheduleDate - 'YYYY-MM-DD' date string
 * @param {object} matchUp - matchUp being checked
 * @param {string} scheduleTime - time being checked
 * @param {number} averageMatchUpMinutes - number of minutes matchUp is expected to last
 *
 * @param {object} requestConflicts - tracks per-matchUp conflicts { [requestId]: { scheduleTimes, matchUpIds }}
 * @param {boolean} potentials - whether to consdier potential participants when determining conflicts
 * @param {object} personRequests - contains personRequests { [personId]: [request] }
 *
 * @returns
 */
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
      if (requestConflicts[requestId]) {
        if (!requestConflicts[requestId].scheduleTimes.includes(scheduleTime))
          requestConflicts[requestId].scheduleTimes.push(scheduleTime);
        if (!requestConflicts[requestId].matchUpIds.includes(matchUpId))
          requestConflicts[requestId].matchUpIds.push(matchUpId);
      } else {
        requestConflicts[requestId] = {
          request,
          scheduleTimes: [scheduleTime],
          matchUpIds: [matchUpId],
        };
      }
    }
  }

  return { conflicts };
}
