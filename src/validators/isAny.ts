import { ANY, ANY_ABBR } from '@Constants/genderConstants';

const ANY_GENDERS = new Set([ANY, ANY_ABBR]);

export function isAny(gender: any): boolean {
  return ANY_GENDERS.has(gender);
}
