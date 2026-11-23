import { MIXED, MIXED_ABBR } from '@Constants/genderConstants';

const MIXED_GENDERS = new Set<unknown>([MIXED, MIXED_ABBR]);

export function isMixed(gender: unknown): boolean {
  return MIXED_GENDERS.has(gender);
}
