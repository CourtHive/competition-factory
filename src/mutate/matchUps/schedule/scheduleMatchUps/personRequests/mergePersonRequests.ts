import { canonicalRequest, ClockRequest } from './canonicalRequest';
import { UUID } from '@Tools/UUID';

// constants
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

// requests are validated before any is stored: a request whose date or times are not a date or times
// (scheduling-pipeline.md § 9.9) refuses the whole call with { valid: false }
export function mergePersonRequests({ personRequests, personId, requests }) {
  const filteredRequests: ClockRequest[] = [];
  for (const candidate of requests.filter(({ requestType }) => requestType)) {
    const { request, valid } = canonicalRequest(candidate);
    if (!valid || !request) return { mergeCount: 0, valid: false };
    if (request.requestType === DO_NOT_SCHEDULE && request.date && request.startTime && request.endTime) {
      const { date, startTime, endTime, requestType } = request;
      filteredRequests.push({ date, startTime, endTime, requestType });
    } else {
      filteredRequests.push(request);
    }
  }

  if (!personRequests[personId]) personRequests[personId] = [];

  // Do not add any request that is missing requestType. Each request gets its own id: modifying or removing a request
  // selects it by id, and a time code (the millisecond) gave every request added in one call the same one
  for (const request of filteredRequests) {
    request.requestId = UUID();
    personRequests[personId].push(request);
  }

  return { mergeCount: filteredRequests.length, valid: true };
}
