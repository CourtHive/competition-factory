import { ANY, ANY_ABBR } from '@Constants/genderConstants';

const ANY_GENDERS = new Set<unknown>([ANY, ANY_ABBR]);

export function isAny(gender: unknown): boolean {
  return ANY_GENDERS.has(gender);
}
