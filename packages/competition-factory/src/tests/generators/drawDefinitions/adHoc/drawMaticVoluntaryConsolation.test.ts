import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { defined } from '@Tests/helpers/defined';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN, AD_HOC, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';

test('drawMatic works for AD_HOC voluntary consolation in a ROUND_ROBIN draw', () => {
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: ROUND_ROBIN, completionGoal: 100 }],
    completeAllMatchUps: true,
    setState: true,
  });

  const vcResult = tournamentEngine.generateVoluntaryConsolation({
    drawType: AD_HOC,
    drawId,
  });
  expect(vcResult.success).toBe(true);

  tournamentEngine.attachConsolationStructures({ structures: vcResult.structures, links: vcResult.links, drawId });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const vcStructure = drawDefinition.structures.find((s: any) => s.stage === VOLUNTARY_CONSOLATION);
  expect(vcStructure).toBeDefined();

  const eligible = tournamentEngine.getEligibleVoluntaryConsolationParticipants({ drawId });
  expect(eligible.eligibleParticipants?.length).toBeGreaterThan(0);

  const participantIds = defined(eligible.eligibleParticipants, 'eligibleParticipants').map(
    (p: any) => p.participantId,
  );

  const result = tournamentEngine.drawMatic({
    structureId: vcStructure.structureId,
    participantIds,
    roundsCount: 1,
    drawId,
  });

  expect(result.error).toBeUndefined();
  expect(result.matchUps).toBeDefined();
  expect(result.matchUps?.length).toBeGreaterThan(0);
});
