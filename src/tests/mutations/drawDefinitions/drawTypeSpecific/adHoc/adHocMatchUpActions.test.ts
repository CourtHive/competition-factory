import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { SWAP_PARTICIPANTS } from '@Constants/positionActionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { randomPop } from '@Tools/arrays';

test('adHocMatchUpActions', () => {
  const drawId = 'did';
  const drawProfile = {
    completionGoal: 10,
    drawType: AD_HOC,
    automated: true,
    roundsCount: 2,
    drawSize: 16,
    idPrefix: 'm',
    drawId,
  };

  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const methods = [
    {
      method: 'positionActions',
      params: {
        structureId: `${drawId}-s-0`,
        matchUpId: `${drawId}-m-2-2`,
        sideNumber: 1,
        drawId,
      },
    },
  ];

  let result = tournamentEngine.executionQueue(methods);
  expect(result.success).toBe(true);
  const swapAction = result.results[0].validActions.find((action) => action.type === SWAP_PARTICIPANTS);
  expect([9, 10].includes(swapAction.swappableParticipantIds.length)).toBe(true);
  const swappableParticipantId = randomPop(swapAction.swappableParticipantIds);
  const { method, payload } = swapAction;
  result = tournamentEngine[method](payload);
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  payload.participantIds.push(swappableParticipantId);
  result = tournamentEngine[method](payload);
  expect(result.success).toBe(true);
});
