import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPASS, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

it.each([
  { drawSize: 4, dependencyMap: { 1: 0, 2: 2 } },
  { drawSize: 32, dependencyMap: { 1: 0, 2: 2, 3: 6, 4: 14, 5: 30 } },
])('can clear scheduled matchUps', ({ drawSize, dependencyMap }) => {
  const drawProfiles = [{ drawSize }];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const { matchUpDependencies } = getMatchUpDependencies({
    matchUps,
    drawIds,
  });

  const { roundMatchUps } = tournamentEngine.getRoundMatchUps({
    matchUps,
  });

  Object.keys(dependencyMap).forEach((roundNumber) => {
    roundMatchUps[roundNumber].forEach(({ matchUpId }) =>
      expect(matchUpDependencies[matchUpId].matchUpIds.length).toEqual(dependencyMap[roundNumber]),
    );
  });
});

it('can build a dependency map across structures', () => {
  const drawProfiles = [{ drawSize: 32, drawType: COMPASS }];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const { matchUpDependencies } = getMatchUpDependencies({
    matchUps,
    drawIds,
  });

  const targetMatchUp = matchUps.find(
    ({ structureName, roundNumber }) => structureName === 'West' && roundNumber === 1,
  );
  const dependencies = matchUpDependencies[targetMatchUp.matchUpId].matchUpIds;
  matchUps
    .filter(({ matchUpId }) => dependencies.includes(matchUpId))
    .forEach(({ structureName, roundNumber, roundPosition }) => {
      expect(structureName).toEqual('East');
      expect(roundNumber).toEqual(1);
      expect([1, 2].includes(roundPosition)).toEqual(true);
    });
});

it('can capture distance between matchUps', () => {
  const drawSize = 16;
  const drawProfiles = [{ drawSize, drawType: SINGLE_ELIMINATION, idPrefix: 'dist' }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUpDependencies } = tournamentEngine.getMatchUpDependencies();
  const sourceDistance = (a, b) =>
    matchUpDependencies[a].sources.reduce((distance, round, index) => (round.includes(b) && index + 1) || distance, 0);
  const getDistance = (x, y) => sourceDistance(x, y) || sourceDistance(y, x);
  expect(getDistance('dist-4-1', 'dist-1-1')).toEqual(3);
  expect(getDistance('dist-3-1', 'dist-1-1')).toEqual(2);
  expect(getDistance('dist-2-1', 'dist-1-1')).toEqual(1);
  expect(getDistance('dist-2-2', 'dist-2-1')).toEqual(0);
  expect(getDistance('dist-1-1', 'dist-4-1')).toEqual(3);
});
