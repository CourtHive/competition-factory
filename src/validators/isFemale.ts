import { FEMALE, FEMALE_ABBR } from '@Constants/genderConstants';

const FEMALE_GENDERS = new Set([FEMALE, FEMALE_ABBR]);

export function isFemale(gender: any): boolean {
  return FEMALE_GENDERS.has(gender);
}
