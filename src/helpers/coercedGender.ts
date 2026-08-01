import { isFemale } from '@Validators/isFemale';
import { isMale } from '@Validators/isMale';
import { isMixed } from '@Validators/isMixed';
import { isAny } from '@Validators/isAny';

// constants and types
import { ANY, FEMALE, MALE, MIXED, OTHER } from '@Constants/genderConstants';

export function coercedGender(gender: any): string | undefined {
  if (gender) {
    if (isFemale(gender)) return FEMALE;
    if (isMixed(gender)) return MIXED;
    if (isMale(gender)) return MALE;
    if (isAny(gender)) return ANY;
  }
  return OTHER;
}

// Normalize an input `gender` to its canonical extended form for persistence.
// Accepts TODS short codes (M/F/X/A) and extended forms (MALE/FEMALE/MIXED/ANY) and
// returns the extended form. Unrecognized input passes through unchanged so existing
// validation can reject it — unlike coercedGender, this never coerces to OTHER, since
// the gender vocabulary excludes OTHER (that is sex-only; see coercedSex).
export function normalizeGender(gender: any): any {
  if (isFemale(gender)) return FEMALE;
  if (isMixed(gender)) return MIXED;
  if (isMale(gender)) return MALE;
  if (isAny(gender)) return ANY;
  return gender;
}
