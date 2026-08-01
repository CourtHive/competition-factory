import { MIXED, MIXED_ABBR } from '@Constants/genderConstants';

const MIXED_GENDERS = new Set([MIXED, MIXED_ABBR]);

export function isMixed(gender: any): boolean {
  return MIXED_GENDERS.has(gender);
}
