import { OTHER, OTHER_ABBR } from '@Constants/genderConstants';

export function isOther(sex: any): boolean {
  return [OTHER, OTHER_ABBR].includes(sex);
}
