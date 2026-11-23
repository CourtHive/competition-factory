import { isFemale } from '@Validators/isFemale';
import { isOther } from '@Validators/isOther';
import { isMale } from '@Validators/isMale';

// constants
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';

// Normalize an input `sex` to its canonical extended form. Accepts the TODS short
// codes (F/M/O) and the extended forms (FEMALE/MALE/OTHER) and returns the extended
// form. Returns undefined for unrecognized input so callers can decline to persist a
// bad value. The sex vocabulary is FEMALE/MALE/OTHER — it excludes ANY and MIXED
// (those are gender-only). Compare with coercedGender for the event/gender vocabulary.
export function coercedSex(sex: any): string | undefined {
  if (isFemale(sex)) return FEMALE;
  if (isMale(sex)) return MALE;
  if (isOther(sex)) return OTHER;
  return undefined;
}

// A person's sex is optional, but a value that is present must be in the sex vocabulary.
// Absent (undefined/null) and the clear request ('') are not unrecognized. ANY and MIXED
// are valid genders and still unrecognized here: a person stored with sex ANY cannot be
// entered into a FEMALE or MALE event, and nothing said so until the entry was refused.
export const UNRECOGNIZED_SEX_INFO = 'person.sex must be FEMALE, MALE or OTHER';

export function isUnrecognizedSex(sex: unknown): boolean {
  return sex !== undefined && sex !== null && sex !== '' && !coercedSex(sex);
}

// Mutate a person in place, rewriting a recognized `sex` to its canonical extended
// form and dropping an empty one. Callers refuse an unrecognized sex before this runs.
export function coercePersonSex(person?: { sex?: any }): void {
  if (!person) return undefined;
  if (person.sex === '' || person.sex === null) {
    delete person.sex;
  } else {
    const canonical = coercedSex(person.sex);
    if (canonical) person.sex = canonical;
  }
  return undefined;
}
