import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, test } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';

test('drawPosition placement is not randomized when drawSize: 2', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, generate: false }],
  });

  const stateResult = tournamentEngine.setState(tournamentRecord);
  expect(stateResult.success).toEqual(true);

  let event = tournamentEngine.getEvent({ eventId }).event;
  let enteredParticipantOrder = event.entries.map(xa('participantId'));

  let generationResult = tournamentEngine.generateDrawDefinition({ eventId });
  let positionAssignments = tournamentEngine.getPositionAssignments(generationResult).positionAssignments;
  let positionedParticipantOrder = positionAssignments.map(xa('participantId'));
  // EXPECT: to be equivalent
  expect(enteredParticipantOrder).toEqual(positionedParticipantOrder);

  // move participant at { entryPosition: 2 } to { entryPosition : 1 }
  const entryPositionResult = tournamentEngine.setEntryPosition({
    drawId: generationResult.drawDefinition.drawId,
    participantId: enteredParticipantOrder[1],
    entryPosition: 1,
    eventId,
  });
  expect(entryPositionResult.success).toEqual(true);

  event = tournamentEngine.getEvent({ eventId }).event;

  generationResult = tournamentEngine.generateDrawDefinition({ eventId });
  positionAssignments = tournamentEngine.getPositionAssignments(generationResult).positionAssignments;
  positionedParticipantOrder = positionAssignments.map(xa('participantId'));
  // EXPECT: not to be equivalent
  expect(enteredParticipantOrder).not.toEqual(positionedParticipantOrder);

  // update from 2nd generated drawDefinition
  enteredParticipantOrder = event.entries.map(xa('participantId'));
  // EXPECT: to be equivalent
  expect(enteredParticipantOrder).toEqual(positionedParticipantOrder);

  const drawEntries = [...event.entries].reverse().map((entry, i) => ({ ...entry, entryPosition: i + 1 }));

  // pass drawEntries in desired positionAssignment order
  generationResult = tournamentEngine.generateDrawDefinition({
    drawEntries,
    eventId,
  });

  const drawEntriesOrder = generationResult.drawDefinition.entries.map(xa('participantId'));
  expect(enteredParticipantOrder).not.toEqual(drawEntriesOrder);

  positionAssignments = tournamentEngine.getPositionAssignments(generationResult).positionAssignments;
  positionedParticipantOrder = positionAssignments.map(xa('participantId'));

  expect(positionedParticipantOrder).toEqual(drawEntriesOrder);
});
