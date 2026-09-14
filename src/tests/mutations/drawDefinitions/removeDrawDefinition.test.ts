import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCORING_DEFAULT from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

it('will not delete draws when scores are present', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId: 'Draw1', drawSize: 8 },
      { eventId: 'Event2', drawId: 'Draw2', drawSize: 8 },
      { drawId: 'Draw3', drawSize: 8 },
      { eventId: 'Event4', drawId: 'Draw4', drawSize: 8 },
    ],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const allCompleted = matchUps.every(checkScoreHasValue);
  expect(allCompleted).toEqual(true);

  let result = tournamentEngine.deleteDrawDefinitions({ drawIds: ['Draw1'] });
  expect(result.error).toEqual(SCORES_PRESENT);
  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: ['Draw1'],
    force: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteFlightAndFlightDraw({
    eventId: 'Event2',
    drawId: 'Draw2',
  });
  expect(result.error).toEqual(SCORES_PRESENT);
  result = tournamentEngine.deleteFlightAndFlightDraw({
    eventId: 'Event2',
    drawId: 'Draw2',
    force: true,
  });
  expect(result.success).toEqual(true);

  // now test policyDefinitions
  result = tournamentEngine.deleteDrawDefinitions({ drawIds: ['Draw3'] });
  expect(result.error).toEqual(SCORES_PRESENT);

  result = tournamentEngine.deleteFlightAndFlightDraw({
    eventId: 'Event4',
    drawId: 'Draw4',
  });
  expect(result.error).toEqual(SCORES_PRESENT);

  const policyDefinitions = {
    [POLICY_TYPE_SCORING]: {
      ...POLICY_SCORING_DEFAULT[POLICY_TYPE_SCORING],
      allowDeletionWithScoresPresent: {
        drawDefinitions: true,
      },
    },
  };

  const extension = { name: APPLIED_POLICIES, value: policyDefinitions };

  result = tournamentEngine.addTournamentExtension({ extension });
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteDrawDefinitions({ drawIds: ['Draw3'] });
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteFlightAndFlightDraw({
    eventId: 'Event4',
    drawId: 'Draw4',
  });
  expect(result.success).toEqual(true);
});
