import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { getNextUnfilledDrawPositions } from '@Query/drawDefinition/positionActions/getNextUnfilledDrawPositions';
import { MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { INDIVIDUAL } from '@Constants/participantConstants';

it('can report on drawPositions available for placement', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, automated: false, seedsCount: 8 }],
    participantsProfile: { participantsCount: 32 },
  });
  tournamentEngine.setState(tournamentRecord);

  const { participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const {
    structures: [{ structureId }],
  } = drawDefinition;

  // @ts-expect-error missing structureId
  let result: any = getNextUnfilledDrawPositions({ drawDefinition });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = getNextUnfilledDrawPositions({
    structureId: 'bogusId',
    drawDefinition,
  });
  expect(result.error).toEqual(STRUCTURE_NOT_FOUND);

  let { nextUnfilledDrawPositions } = getNextUnfilledDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(nextUnfilledDrawPositions).toEqual([1]);

  let drawPosition = nextUnfilledDrawPositions?.pop();
  let participantId = drawPosition && tournamentParticipants[drawPosition - 1].participantId;

  result =
    drawPosition &&
    assignDrawPosition({
      drawDefinition,
      participantId,
      drawPosition,
      structureId,
    });
  expect(result?.success).toEqual(true);

  ({ nextUnfilledDrawPositions } = getNextUnfilledDrawPositions({
    drawDefinition,
    structureId,
  }));
  expect(nextUnfilledDrawPositions).toEqual([32]);

  drawPosition = nextUnfilledDrawPositions?.pop();
  participantId = drawPosition && tournamentParticipants[drawPosition - 1].participantId;
  result =
    drawPosition &&
    assignDrawPosition({
      drawDefinition,
      participantId,
      drawPosition,
      structureId,
    });
  expect(result?.success).toEqual(true);

  ({ nextUnfilledDrawPositions } = getNextUnfilledDrawPositions({
    drawDefinition,
    structureId,
  }));
  expect(nextUnfilledDrawPositions?.sort()).toEqual([24, 9]);
});

it('will report [] when no drawPositions available for placement', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, automated: true, seedsCount: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const {
    structures: [{ structureId }],
  } = drawDefinition;

  const { nextUnfilledDrawPositions } = getNextUnfilledDrawPositions({
    drawDefinition,
    structureId,
  });
  expect(nextUnfilledDrawPositions).toEqual([]);
});
