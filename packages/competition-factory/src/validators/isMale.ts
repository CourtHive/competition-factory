import { MALE, MALE_ABBR } from '@Constants/genderConstants';

const MALE_GENDERS = new Set<unknown>([MALE, MALE_ABBR]);

export function isMale(gender: unknown): boolean {
  return MALE_GENDERS.has(gender);
}
