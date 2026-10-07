import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

it('finds position dependencies in every tournament record, not only the last', () => {
  const { tournamentRecord: first } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    tournamentAttributes: { tournamentId: 'first' },
  });
  const { tournamentRecord: second } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    tournamentAttributes: { tournamentId: 'second' },
  });

  competitionEngine.setState(first);
  let result: any = competitionEngine.getMatchUpDependencies();
  expect(Object.values(result.positionDependencies).length).toEqual(1);

  competitionEngine.setState([first, second]);
  result = competitionEngine.getMatchUpDependencies();
  const positionDependencies: any[] = Object.values(result.positionDependencies);
  expect(positionDependencies.length).toEqual(1);
  // Round Robin of 4x4 produces 24 matchUps
  expect(positionDependencies[0].length).toEqual(24);
});
