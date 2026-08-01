import { OTHER, OTHER_ABBR } from '@Constants/genderConstants';

const OTHER_SEXES = new Set([OTHER, OTHER_ABBR]);

export function isOther(sex: any): boolean {
  return OTHER_SEXES.has(sex);
}
