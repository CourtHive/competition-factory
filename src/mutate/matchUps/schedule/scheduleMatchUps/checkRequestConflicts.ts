import { getIndividualParticipants } from '../../../../query/matchUp/getIndividualParticipants';
import { addMinutes, extractDate, extractTime, sameDay, timeToDate } from '@Tools/dateTime';

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
    const potentialPersonIds = (matchUp?.potentialParticipants ?? []).flat().map(({ person }) => person?.personId);
    personIds.push(...potentialPersonIds);
  }

  const relevantPersonRequests = personIds
    .map((personId) => personRequests[personId]?.map((request) => ({ ...request, personId })))
    .filter(Boolean)
    .flat()
    .filter((request) => request.requestType === DO_NOT_SCHEDULE && sameDay(scheduleDate, request.date));

  const conflicts: any[] = [];
  const matchUpId = matchUp?.matchUpId;
  const scheduleStart = timeToDate(extractTime(scheduleTime), extractDate(scheduleDate));
  const averageEnd = extractTime(addMinutes(scheduleStart, averageMatchUpMinutes).toISOString());

  // scheduleTime, averageEnd, startTime and endTime are all string format '00:00'
  // string comparison < > is used to determine...
  // ...if either schedultTime or averageEnd falls between request startTime and endTime
  for (const request of relevantPersonRequests) {
    const { requestId, startTime, endTime } = request;
    const conflict =
      (scheduleTime > startTime && scheduleTime < endTime) ||
      (averageEnd && averageEnd > startTime && averageEnd < endTime);
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
