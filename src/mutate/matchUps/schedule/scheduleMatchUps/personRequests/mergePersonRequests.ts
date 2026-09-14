import { extractDate, extractTime } from '@Tools/dateTime';
import { generateTimeCode } from '@Tools/timeCode';

// constants
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

// check whether there is a request for the date with overlapping times
// extend startTime/endTime rather than creating multiple
// ... only pertains to { requestType: DO_NOT_SCHEDULE }
export function mergePersonRequests({ personRequests, personId, requests }) {
  if (!personRequests[personId]) personRequests[personId] = [];

  const filteredRequests = requests
    .filter(({ requestType }) => requestType)
    .map((request) => {
      let { date, startTime, endTime } = request;

      // validate requestType
      if (request.requestType === DO_NOT_SCHEDULE) {
        date = extractDate(date);
        startTime = extractTime(startTime);
        endTime = extractTime(endTime);
        if (date && startTime && endTime) {
          return { date, startTime, endTime, requestType: request.requestType };
        }
      }
      return request;
    })
    .filter(Boolean);

  // Do not add any request that is missing requestType
  for (const request of filteredRequests) {
    request.requestId = generateTimeCode();
    personRequests[personId].push(request);
  }

  return { mergeCount: filteredRequests.length };
}
