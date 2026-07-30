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
  const expected = [TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS];

  // every constant self-maps (key === value) — the invariant attr-audit pass #5 now enforces
  for (const [key, value] of Object.entries(disciplineConstants)) {
    expect(key).toEqual(value);
    expect(isScreamingSnake(value)).toBe(true);
  }

  // the tuple the type derives from and the constant object expose the same value set
  expect([...disciplines].toSorted((a, b) => a.localeCompare(b))).toEqual(
    expected.toSorted((a, b) => a.localeCompare(b)),
  );
  expect(Object.values(disciplineConstants).toSorted((a, b) => a.localeCompare(b))).toEqual(
    expected.toSorted((a, b) => a.localeCompare(b)),
  );
});

function isScreamingSnake(str: string): boolean {
  return /^[A-Z][A-Z_]+$/.test(str);
}
