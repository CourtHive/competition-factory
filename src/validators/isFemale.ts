import { FEMALE, FEMALE_ABBR } from '@Constants/genderConstants';

const FEMALE_GENDERS = new Set<unknown>([FEMALE, FEMALE_ABBR]);

export function isFemale(gender: unknown): boolean {
  return FEMALE_GENDERS.has(gender);
}
