import { canonicalDate, canonicalTime } from '@Tools/canonicalClock';

export type ClockRequest = {
  requestType?: string;
  requestId?: string;
  startTime?: string;
  endTime?: string;
  date?: string;
  [key: string]: unknown;
};

const CLOCK_FIELDS = { date: canonicalDate, startTime: canonicalTime, endTime: canonicalTime };

/**
 * A person request with its clock fields in canonical form (scheduling-pipeline.md § 9.9): a `date` that is a calendar
 * day, a `startTime` and `endTime` that are times. A field left out stays out; a field present that is not a date or
 * a time makes the request invalid, and nothing of it is stored.
 */
export function canonicalRequest(request: unknown): { request?: ClockRequest; valid: boolean } {
  if (!request || typeof request !== 'object') return { valid: false };
  const source = request as ClockRequest;
  const canonical: ClockRequest = { ...source };
  for (const [field, canonicalize] of Object.entries(CLOCK_FIELDS)) {
    if (source[field] === undefined) continue;
    const value = canonicalize(source[field]);
    if (value === undefined) return { valid: false };
    canonical[field] = value;
  }
  return { request: canonical, valid: true };
}
