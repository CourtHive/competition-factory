import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and fixtures
import { ELIMINATION, FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/eventConstants';

it('correctly assigns positions for Elimination structure', () => {
  const drawSize = 32;
  const participantsCount = 17;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent } = result;
  const { eventId } = createdEvent;

  const participantIds = participants.map((p) => p.participantId);
  tournamentEngine.addEventEntries({ eventId, participantIds });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    matchUpFormat: FORMAT_STANDARD,
    drawType: ELIMINATION,
    drawSize,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition });

  result = structureAssignedDrawPositions({ drawDefinition, structure });
  expect(result.assignedPositions.length).toEqual(32);
  expect(result.allPositionsAssigned).toEqual(true);
  expect(result.byePositions.length).toEqual(15);
});

it('correctly assigns BYE positions in consolation structure', () => {
  const drawSize = 32;
  const participantsCount = 17;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'First Round Loser Consolation',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent } = result;
  const { eventId } = createdEvent;

  const participantIds = participants.map((p) => p.participantId);
  tournamentEngine.addEventEntries({ eventId, participantIds });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawType: FIRST_ROUND_LOSER_CONSOLATION,
    matchUpFormat: FORMAT_STANDARD,
    drawSize,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const {
    structures: [mainStructure, consolationStructure],
  } = getDrawStructures({ drawDefinition });

  result = structureAssignedDrawPositions({
    structure: mainStructure,
    drawDefinition,
  });
  expect(result.assignedPositions.length).toEqual(32);
  expect(result.allPositionsAssigned).toEqual(true);
  expect(result.byePositions.length).toEqual(15);

  result = structureAssignedDrawPositions({
    structure: consolationStructure,
    drawDefinition,
  });
  expect(result.assignedPositions.length).toEqual(15);
  expect(result.allPositionsAssigned).toEqual(false);
  expect(result.byePositions.length).toEqual(15);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [consolationStructure.structureId] },
  });
  const finalMatchUp = matchUps.find(({ finishingRound }) => finishingRound === 1);
  expect(finalMatchUp.matchUpStatus).toEqual(BYE);

  const matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[BYE]).toEqual(15);
  expect(matchUps.length).toEqual(15);
});

it('correctly assigns BYE positions in consolation structure', () => {
  const drawSize = 8;
  const participantsCount = 5;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'First Round Loser Consolation',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent } = result;
  const { eventId } = createdEvent;

  const participantIds = participants.map((p) => p.participantId);
  tournamentEngine.addEventEntries({ eventId, participantIds });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawType: FIRST_ROUND_LOSER_CONSOLATION,
    matchUpFormat: FORMAT_STANDARD,
    drawSize,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const {
    structures: [mainStructure, consolationStructure],
  } = getDrawStructures({ drawDefinition });

  result = structureAssignedDrawPositions({
    structure: mainStructure,
    drawDefinition,
  });
  expect(result.assignedPositions.length).toEqual(8);
  expect(result.allPositionsAssigned).toEqual(true);
  expect(result.byePositions.length).toEqual(3);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [consolationStructure.structureId] },
  });
  const finalMatchUp = matchUps.find(({ finishingRound }) => finishingRound === 1);
  expect(finalMatchUp.matchUpStatus).toEqual(BYE);

  result = structureAssignedDrawPositions({
    structure: consolationStructure,
    drawDefinition,
  });
  expect(result.assignedPositions.length).toEqual(3);
  expect(result.allPositionsAssigned).toEqual(false);
  expect(result.byePositions.length).toEqual(3);

  const matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[BYE]).toEqual(3);
  expect(matchUps.length).toEqual(3);
});
