import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ALTERNATE } from '@Constants/entryStatusConstants';
import {
  DRAW_POSITION_ASSIGNED,
  MISSING_DRAW_POSITION,
  MISSING_STRUCTURE_ID,
} from '@Constants/errorConditionConstants';

it('will return participant events including all entryStatuses', () => {
  const drawProfiles = [{ drawSize: 16, participantsCount: 14 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 32 },
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { event } = tournamentEngine.getEvent({ drawId });
  const alternateEntries = event.entries.filter(({ entryStatus }) => entryStatus === ALTERNATE);
  const alternateParticipantIds = alternateEntries.map(({ participantId }) => participantId);

  const structureId = drawDefinition.structures[0].structureId;
  const updatedAt = drawDefinition.structures[0].updatedAt;
  let { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });
  expect(positionAssignments.length).toEqual(16);
  expect(positionAssignments[1].bye).toEqual(true);

  let result = tournamentEngine.assignDrawPosition({
    participantId: alternateParticipantIds[0],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);

  result = tournamentEngine.assignDrawPosition({
    participantId: alternateParticipantIds[0],
    drawPosition: 2,
    drawId,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = tournamentEngine.assignDrawPosition({
    participantId: alternateParticipantIds[0],
    drawPosition: 2,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  let structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  expect(new Date(structure.updatedAt).getTime()).toBeGreaterThan(new Date(updatedAt).getTime());

  ({ positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }));
  expect(positionAssignments[1].bye).not.toEqual(true);
  expect(positionAssignments[1].participantId).toEqual(alternateParticipantIds[0]);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [alternateParticipantIds[0]] },
    withStatistics: true,
    withOpponents: true,
    withMatchUps: true,
    withEvents: true,
  });
  expect(participants[0].events[0].entryStatus).toEqual(ALTERNATE);
  const { opponents, matchUps } = participants[0];
  expect(alternateParticipantIds[0]).not.toEqual(opponents[0].participantId);
  expect(matchUps[0].opponentParticipantInfo[0].participantId).toEqual(opponents[0].participantId);
  expect(positionAssignments[0].participantId).toEqual(opponents[0].participantId);

  result = tournamentEngine.assignDrawPosition({
    drawPosition: 2,
    structureId,
    bye: true,
    drawId,
  });
  expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
  expect(result.stack).toEqual(['assignDrawPositionBye']);

  result = tournamentEngine.assignDrawPosition({
    drawPosition: 2,
    qualifier: true,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  expect(structure.positionAssignments.find((pa) => pa.qualifier === true).drawPosition).toEqual(2);
});
