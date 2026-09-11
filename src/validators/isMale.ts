import { MALE, MALE_ABBR } from '@Constants/genderConstants';

const MALE_GENDERS = new Set([MALE, MALE_ABBR]);

export function isMale(gender: any): boolean {
  return MALE_GENDERS.has(gender);
}
