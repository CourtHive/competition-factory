import { asOfDate } from './asOfDate';

/** Encode the supplied instant with a local-hour offset. Omitting asOf uses the call clock in 7.x and is removed in 8.0.0. */
export function generateTimeCode(index: number = 0, asOf?: Date | string): string {
  if (typeof index !== 'number' || isNaN(index)) index = 0;
  const uidate = asOfDate(asOf);
  uidate.setHours(uidate.getHours() + index);
  return uidate.getTime().toString(36).slice(-6).toUpperCase();
}
