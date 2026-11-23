import { OTHER, OTHER_ABBR } from '@Constants/genderConstants';

const OTHER_SEXES = new Set<unknown>([OTHER, OTHER_ABBR]);

export function isOther(sex: unknown): boolean {
  return OTHER_SEXES.has(sex);
}
