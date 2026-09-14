import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { CONSOLATION, CURTIS_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import POLICY_SCORING_DEFAULT from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

it('will not delete structures when scores are present', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 32 }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const allCompleted = matchUps.every(checkScoreHasValue);
  expect(allCompleted).toEqual(true);

  const {
    structures: [mainStructure, consolationStructure, consolationStructure2],
  } = tournamentEngine.getEvent({ drawId }).drawDefinition;

  expect(consolationStructure2.stage).toEqual(CONSOLATION);
  expect(consolationStructure.stage).toEqual(CONSOLATION);
  expect(mainStructure.stage).toEqual(MAIN);

  let result = tournamentEngine.removeStructure({
    structureId: consolationStructure2.structureId,
    drawId,
  });
  expect(result.error).toEqual(SCORES_PRESENT);

  result = tournamentEngine.removeStructure({
    structureId: consolationStructure2.structureId,
    force: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeStructure({
    structureId: consolationStructure.structureId,
    drawId,
  });
  expect(result.error).toEqual(SCORES_PRESENT);

  const policyDefinitions = {
    [POLICY_TYPE_SCORING]: {
      ...POLICY_SCORING_DEFAULT[POLICY_TYPE_SCORING],
      allowDeletionWithScoresPresent: {
        structures: true,
      },
    },
  };

  const extension = { name: APPLIED_POLICIES, value: policyDefinitions };

  result = tournamentEngine.addTournamentExtension({ extension });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeStructure({
    structureId: consolationStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
});
