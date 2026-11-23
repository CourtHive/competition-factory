import { getSharedIndividualConflicts } from '@Query/participants/individualParticipantIds';
import { describe, expect, it } from 'vitest';

// CodeQL #224, #225 (js/loop-bound-injection), triaged 2026-11-23 as reachable but bounded: the check compared every
// pair of entrants, 7.7 s at 16,384. A crafted import can reach that size, so it is now linear in the individuals listed.

/** The pairwise implementation it replaced, kept verbatim as the reference the new one must match exactly. */
function pairwiseReference(individualIdsMap: Record<string, string[]>, participantIds: string[]): string[][] {
  const shares = (a: string, b: string) => {
    if (a === b) return true;
    const bIds = new Set(individualIdsMap[b] ?? []);
    return (individualIdsMap[a] ?? []).some((id) => bIds.has(id));
  };
  const conflicting: string[][] = [];
  for (let i = 0; i < participantIds.length; i++)
    for (let j = i + 1; j < participantIds.length; j++) {
      if (participantIds[i] === participantIds[j]) continue;
      if (shares(participantIds[i], participantIds[j])) conflicting.push([participantIds[i], participantIds[j]]);
    }
  return conflicting;
}

describe('getSharedIndividualConflicts', () => {
  it('is linear in entrants: 16,384 without conflicts within budget', () => {
    const participantIds = Array.from({ length: 16_384 }, (_, i) => `p${i}`);
    const individualIdsMap = Object.fromEntries(participantIds.map((id) => [id, [`i-${id}`]]));
    const start = performance.now();
    expect(getSharedIndividualConflicts({ individualIdsMap, participantIds })).toEqual([]);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it('returns exactly what the pairwise check returned, order and repeats included', () => {
    let seed = 20261123;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let nonEmpty = 0;
    for (let round = 0; round < 3_000; round++) {
      const people = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, i) => `i${i}`);
      const entrants = Array.from({ length: 1 + Math.floor(random() * 9) }, (_, i) => `p${i}`);
      const individualIdsMap: Record<string, string[]> = {};
      for (const entrant of entrants)
        if (random() > 0.1)
          // some entrants are absent from the map
          individualIdsMap[entrant] = Array.from(
            { length: Math.floor(random() * 3) },
            () => people[Math.floor(random() * people.length)],
          );
      // ids drawn with replacement: an entrant listed twice is a DUPLICATE_ENTRY question, not a conflict
      const participantIds = Array.from(
        { length: Math.floor(random() * 10) },
        () => entrants[Math.floor(random() * entrants.length)],
      );
      const expected = pairwiseReference(individualIdsMap, participantIds);
      if (expected.length) nonEmpty += 1;
      expect(
        getSharedIndividualConflicts({ individualIdsMap, participantIds }),
        JSON.stringify({ individualIdsMap, participantIds }),
      ).toEqual(expected);
    }
    expect(nonEmpty).toBeGreaterThan(500); // the sample exercises conflicts, not only clean fields
  });
});
