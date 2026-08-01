import { expect, test } from 'vitest';

import {
  disciplineConstants,
  disciplines,
  TENNIS,
  BEACH_TENNIS,
  WHEELCHAIR_TENNIS,
} from '@Constants/disciplineConstants';

// Guards the DisciplineUnion source of truth: the type is derived from `disciplines`
// (see tournamentTypes.ts), so this tuple and the disciplineConstants object are what
// keep the type, the constants, and attr-audit's value vocab in agreement.
test('disciplines tuple and disciplineConstants stay consistent', () => {
  // every constant self-maps (key === value) — the invariant attr-audit pass #5 now enforces
  for (const [key, value] of Object.entries(disciplineConstants)) {
    expect(key).toEqual(value);
    expect(isScreamingSnake(value)).toBe(true);
  }

  // the tuple the type derives from and the constant object expose the same value set
  // (asserted as an invariant, not a hardcoded list — the vocabulary is open and grows)
  expect([...disciplines].toSorted((a, b) => a.localeCompare(b))).toEqual(
    Object.values(disciplineConstants).toSorted((a, b) => a.localeCompare(b)),
  );

  // the core racquet disciplines are always present in the known set
  for (const discipline of [TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS]) {
    expect(disciplines).toContain(discipline);
  }
});

function isScreamingSnake(str: string): boolean {
  return /^[A-Z][A-Z_]+$/.test(str);
}
