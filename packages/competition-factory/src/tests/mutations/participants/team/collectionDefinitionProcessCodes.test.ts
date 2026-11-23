import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { it, expect } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

it('collectionDefinitions support processCodes', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4, drawType: ROUND_ROBIN }],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const processCode = 'RANKING.IGNORE';
  const processCodes = [processCode];
  const collectionDefinition = {
    matchUpType: DOUBLES_MATCHUP,
    matchUpFormat: 'SET1-S:T10P',
    collectionName: 'Overtime',
    matchUpCount: 1,
    matchUpValue: 1,
    processCodes,
  };

  result = tournamentEngine.addCollectionDefinition({
    collectionDefinition,
    drawId,
  });

  expect(result.addedMatchUps.length).toEqual(6);
  expect(result.addedMatchUps.every((matchUp) => matchUp.processCodes[0] === processCode)).toEqual(true);
});
