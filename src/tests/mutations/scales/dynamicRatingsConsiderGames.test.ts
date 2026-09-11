import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { expect, it } from 'vitest';

// Regression: generateDynamicRatings computed maxCountables (the Elo K-factor
// normaliser) as `bestOf & setsTo`, where setsTo read a non-existent top-level field
// (always 1) and `&` was a bitwise AND. Under considerGames the value collapsed to
// `bestOf & 1` (≈1) instead of the intended max countable games `bestOf * setFormat.setTo`.
// Corrected to `const setTo = parsedFormat?.setFormat?.setTo || 1` and `bestOf * setTo`.
//
// Deterministic golden values for a best-of-3, set-to-6 draw (maxCountables 3*6 = 18):
//   considerGames:false stays [1402,1402,1402,1592] (fix is scoped to the true branch)
//   considerGames:true was [1467,1467,1467,1531] when buggy (maxCountables 3&1 = 1)
//   considerGames:true is  [909,909,909,2049] fixed (maxCountables 18 → far larger swing)
const outcomes = [
  { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  { roundNumber: 1, roundPosition: 2, scoreString: '6-3 6-4', winningSide: 1 },
  { roundNumber: 2, roundPosition: 1, scoreString: '6-4 3-6 6-2', winningSide: 1 },
];

function sortedRatingValues(considerGames: boolean, baseRecord: any) {
  tournamentEngine.setState(makeDeepCopy(baseRecord));
  const matchUpIds = tournamentEngine.allTournamentMatchUps().matchUps.map((m: any) => m.matchUpId);
  const result: any = scaleEngine.generateDynamicRatings({ considerGames, matchUpIds });
  expect(result.success).toEqual(true);
  return Object.values(result.modifiedScaleValues ?? {})
    .map((v: any) => v.scaleValue)
    .sort((a: number, b: number) => a - b);
}

it('scales the Elo K-factor by bestOf * setTo when considerGames is true', () => {
  const baseRecord = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, matchUpFormat: 'SET3-S:6/TB7', outcomes }],
  }).tournamentRecord;

  const setBased = sortedRatingValues(false, baseRecord);
  const gameBased = sortedRatingValues(true, baseRecord);

  // set-based path unchanged (maxCountables = bestOf = 3)
  expect(setBased).toEqual([1402, 1402, 1402, 1592]);
  // game-based path uses maxCountables = bestOf * setTo = 18 (was ~1 when buggy)
  expect(gameBased).toEqual([909, 909, 909, 2049]);
  // sanity: the corrected game-based K-factor moves ratings further than the set-based one
  expect(gameBased[3] - gameBased[0]).toBeGreaterThan(setBased[3] - setBased[0]);
});
