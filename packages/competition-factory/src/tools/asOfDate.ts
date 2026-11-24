import { now } from './clock';

/** Return a fresh date so a helper can adjust its local hours without mutating the caller's instant. */
export function asOfDate(asOf?: Date | string): Date {
  if (asOf === undefined) return now();
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid asOf date');
  return date;
}
