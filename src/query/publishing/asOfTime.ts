import { isISODateString } from '@Tools/dateTime';
import { competitionNowMs } from '@Tools/clock';

/**
 * The instant a publishing judgement is made against. A clock is an input (CA 2026-11-07): pass `asOf` to judge at a
 * known instant, which also makes a test independent of the clock. Without it, the competition clock. That fallback
 * is 7.x only; 8.0.0 removes the date helpers' implicit "now".
 */
export function asOfTime(asOf?: Date | string): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string' && isISODateString(asOf)) return new Date(asOf).getTime();
  return competitionNowMs();
}
