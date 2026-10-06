import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('an object nextMatchUps adds upcoming matchUps to the categories it selects', () => {
  const drawId = 'did';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, participantsCount: 6 }],
    setState: true,
  });

  // boolean form: every category is processed
  let result: any = tournamentEngine.drawMatchUps({ drawId, inContext: true, nextMatchUps: true });
  expect(result.byeMatchUps.length).toEqual(2);
  expect(result.byeMatchUps.every((m) => m.winnerTo?.matchUpId)).toEqual(true);
  expect(result.upcomingMatchUps.every((m) => m.winnerTo?.matchUpId)).toEqual(true);

  // object form: only the selected categories are processed
  const nextMatchUps = { upcoming: true, pending: true };
  result = tournamentEngine.drawMatchUps({ drawId, inContext: true, nextMatchUps });
  expect(result.upcomingMatchUps.length).toBeGreaterThan(0);
  expect(result.upcomingMatchUps.every((m) => m.winnerTo?.matchUpId)).toEqual(true);
  expect(result.byeMatchUps.length).toEqual(2);
  expect(result.byeMatchUps.some((m) => m.winnerTo)).toEqual(false);
});
