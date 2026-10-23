import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, LOSER, LUCKY_DRAW, MAIN } from '@Constants/drawDefinitionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  LUCKY_DRAW_BYE_LIMIT,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

test('replaceWithBye on a LUCKY_DRAW that already holds its BYE is refused before the seat is cleared', () => {
  // a LUCKY_DRAW of 5 has 6 drawPositions; 5 participants leave exactly one BYE
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 5, drawType: LUCKY_DRAW, participantsCount: 5 }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments } = drawDefinition.structures[0];
  expect(positionAssignments.filter((assignment) => assignment.bye).length).toEqual(1);
  const { drawPosition } = positionAssignments.find((assignment) => assignment.participantId);

  const before = recordCopy();
  let result: any = tournamentEngine.removeDrawPositionAssignment({
    replaceWithBye: true,
    entryStatus: WITHDRAWN,
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(LUCKY_DRAW_BYE_LIMIT);
  expect(recordCopy()).toEqual(before);

  result = tournamentEngine.removeDrawPositionAssignment({ drawPosition, structureId, drawId });
  expect(result.success).toEqual(true);
});

test('withdrawing a PAIR with destroyPair is refused before the seat is cleared when the pair cannot be destroyed', () => {
  const {
    tournamentRecord,
    drawIds: [drawId, otherDrawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 4, eventType: DOUBLES, idPrefix: 'a' },
      { drawSize: 4, eventType: DOUBLES, idPrefix: 'b' },
    ],
  });

  // Hand-built: the pair at drawPosition 1 also holds a seat in the second draw. Dissolving it would
  // be refused by removeEventEntries (EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT) — after the seat
  // had been emptied and the entries rewritten.
  const [firstEvent, secondEvent] = tournamentRecord.events;
  const drawDefinition = firstEvent.drawDefinitions.find((d) => d.drawId === drawId);
  const otherDraw = secondEvent.drawDefinitions.find((d) => d.drawId === otherDrawId);
  const { structureId, positionAssignments } = drawDefinition.structures[0];
  const { participantId } = positionAssignments.find((assignment) => assignment.drawPosition === 1);
  // the second draw is moved into the first event so both draws share the pair's event entry
  firstEvent.drawDefinitions.push(otherDraw);
  secondEvent.drawDefinitions = [];
  otherDraw.structures[0].positionAssignments.find((assignment) => assignment.drawPosition === 1).participantId =
    participantId;
  tournamentEngine.setState(tournamentRecord);

  const before = recordCopy();
  let result: any = tournamentEngine.removeDrawPositionAssignment({
    entryStatus: WITHDRAWN,
    destroyPair: true,
    drawPosition: 1,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(recordCopy()).toEqual(before);

  result = tournamentEngine.removeDrawPositionAssignment({ drawPosition: 1, structureId, drawId });
  expect(result.success).toEqual(true);
});

test('a draw with a malformed LOSER link refuses the removal before the seat is cleared', () => {
  // FMLC, generated well-formed; then its LOSER link loses the round it directs from
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const { structureId } = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const link = drawDefinition.links.find((candidate) => candidate.linkType === LOSER);
  Reflect.deleteProperty(link.source, 'roundNumber');
  tournamentEngine.setState(tournamentRecord);

  const before = recordCopy();
  const result: any = tournamentEngine.removeDrawPositionAssignment({ drawId, structureId, drawPosition: 1 });
  expect(result.error?.code).toEqual(INVALID_VALUES.code);
  expect(recordCopy()).toEqual(before);
});
