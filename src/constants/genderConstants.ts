// Values are intentionally NOT annotated `: string` — an explicit annotation widens
// them and defeats the `as const` below, which is what previously stopped
// genderConstants members from satisfying GenderUnion / SexUnion.
export const FEMALE_ABBR = 'F';
export const OTHER_ABBR = 'O';
export const MIXED_ABBR = 'X';
export const MALE_ABBR = 'M';
export const ANY_ABBR = 'A';

export const FEMALE = 'FEMALE';
export const OTHER = 'OTHER';
export const MIXED = 'MIXED';
export const MALE = 'MALE';
export const ANY = 'ANY';

export const genderConstants = {
  FEMALE_ABBR,
  OTHER_ABBR,
  MIXED_ABBR,
  MALE_ABBR,
  ANY_ABBR,
  FEMALE,
  MIXED,
  OTHER,
  MALE,
  ANY,
} as const;
