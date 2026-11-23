import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

test('matchUpStats count the matchUps of every round robin group', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  // two groups of 4: 6 matchUps each
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withMatchUpStats: true });
  expect(tournamentInfo.matchUpStats.total).toEqual(12);
  expect(tournamentInfo.matchUpStats.completed).toEqual(12);
  expect(tournamentInfo.matchUpStats.percentComplete).toEqual(100);
});

test('structure details give a round robin its groups positionAssignments', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 8 }],
    setState: true,
  });

  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withStructureDetails: true });
  expect(tournamentInfo.structures.length).toEqual(1);
  expect(tournamentInfo.structures[0].positionAssignments.length).toEqual(8);
});
