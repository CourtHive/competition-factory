import { expect, test } from 'vitest';

import { venueConstants, indoorOutdoorTypes, INDOOR, OUTDOOR, MIXED } from '@Constants/venueConstants';

// Guards the IndoorOutdoorUnion source of truth: the type derives from `indoorOutdoorTypes`
// (see tournamentTypes.ts), so this tuple and the venueConstants entries are what keep the
// type, the constants, and attr-audit's value vocab in agreement.
test('indoorOutdoorTypes and venueConstants stay consistent', () => {
  const expected = [INDOOR, OUTDOOR, MIXED];

  for (const value of indoorOutdoorTypes) {
    expect(isScreamingSnake(value)).toBe(true);
    // every indoor/outdoor value is exposed through the venueConstants barrel
    expect(Object.values(venueConstants)).toContain(value);
  }

  expect([...indoorOutdoorTypes].toSorted((a, b) => a.localeCompare(b))).toEqual(
    expected.toSorted((a, b) => a.localeCompare(b)),
  );
});

function isScreamingSnake(str: string): boolean {
  return /^[A-Z][A-Z_]+$/.test(str);
}
