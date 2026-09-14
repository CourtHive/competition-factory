import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';

it('generates correct finishingPositionRanges for FEED_IN_CHAMPIONSHIP', () => {
  let { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let mainMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
  }).matchUps;

  // lower of the loser finishingPositionRange for SINGLE_ELIMINATION MAIN structure
  let expectations = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2 };
  mainMatchUps.forEach(({ roundNumber, finishingPositionRange }) => {
    expect(Math.max(...finishingPositionRange.loser)).toEqual(expectations[roundNumber]);
  });

  tournamentRecord = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32 }],
  }).tournamentRecord;

  result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  mainMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
  }).matchUps;

  // lower of the loser finishingPositionRange for MAIN structure has been modified by the addtion of fed structure
  expectations = { 1: 32, 2: 24, 3: 12, 4: 6, 5: 3 };
  mainMatchUps.forEach(({ roundNumber, finishingPositionRange }) => {
    expect(Math.max(...finishingPositionRange.loser)).toEqual(expectations[roundNumber]);
  });
});
