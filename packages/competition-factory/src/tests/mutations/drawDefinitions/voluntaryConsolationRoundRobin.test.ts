import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { EXISTING_STRUCTURE } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';

it('a round robin voluntary consolation with group matchUps is an existing structure', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    matchUpsLimit: 1,
    drawId,
  });
  const participantIds = eligibleParticipants.map(({ participantId }) => participantId).slice(0, 8);

  let result: any = tournamentEngine.addDrawEntries({
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: DIRECT_ACCEPTANCE,
    participantIds,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateVoluntaryConsolation({ drawType: ROUND_ROBIN, automated: true, drawId });
  expect(result.success).toEqual(true);
  expect(result.structures.length).toEqual(1);

  result = tournamentEngine.attachConsolationStructures({ structures: result.structures, links: result.links, drawId });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolation = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(consolation.structures.flatMap((group) => group.matchUps).length).toBeGreaterThan(0);

  result = tournamentEngine.generateVoluntaryConsolation({ drawType: ROUND_ROBIN, automated: true, drawId });
  expect(result.error).toEqual(EXISTING_STRUCTURE);
});
