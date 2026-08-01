import { isFemale } from '@Validators/isFemale';
import { isOther } from '@Validators/isOther';
import { isMale } from '@Validators/isMale';

// constants and types
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

// Mutate a person in place, rewriting a recognized `sex` to its canonical extended
// form. No-op when the person is absent or its sex is unrecognized (left untouched).
export function coercePersonSex(person?: { sex?: any }): void {
  if (!person) return;
  const canonical = coercedSex(person.sex);
  if (canonical) person.sex = canonical;
}
