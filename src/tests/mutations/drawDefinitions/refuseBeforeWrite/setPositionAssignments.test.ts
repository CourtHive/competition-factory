import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { LUCKY_DRAW, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  DRAW_POSITION_ASSIGNED,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  LUCKY_DRAW_BYE_LIMIT,
} from '@Constants/errorConditionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

const policyDefinitions = {
  [POLICY_TYPE_SEEDING]: { ...POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING], validSeedPositions: { ignore: false } },
};

// an 8 draw generated without positioning: every seat is empty
function setup(drawProfile = {}) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, automated: false, ...drawProfile }],
    policyDefinitions,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const participantIds = drawDefinition.entries.map(({ participantId }) => participantId);
  expect(structure.positionAssignments.every(({ participantId, bye }) => !participantId && !bye)).toEqual(true);
  return { drawId, structureId: structure.structureId, participantIds };
}

test('a payload that seats one participant twice is refused before any seat is written', () => {
  const { drawId, structureId, participantIds } = setup();
  // seats 1-4 are valid; seat 5 repeats seat 1's participant
  const positionAssignments = [1, 2, 3, 4, 5, 6, 7, 8].map((drawPosition) => ({
    participantId: participantIds[drawPosition === 5 ? 0 : drawPosition - 1],
    drawPosition,
  }));

  const before = recordCopy();
  let result: any = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(recordCopy()).toEqual(before);

  positionAssignments[4].participantId = participantIds[4];
  result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.success).toEqual(true);
});

test('a payload whose seed is placed outside its block is refused before the seeds are written', () => {
  const { drawId, structureId, participantIds } = setup();
  const seedAssignments = [{ seedNumber: 1, seedValue: '1', participantId: participantIds[0] }];
  // seed 1 belongs at drawPosition 1; the payload puts it at 3, after seating 1 and 2
  const order = [1, 2, 0, 3, 4, 5, 6, 7];
  const positionAssignments = order.map((index, i) => ({ participantId: participantIds[index], drawPosition: i + 1 }));

  const before = recordCopy();
  const result: any = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments, seedAssignments }],
    drawId,
  });
  expect(result.error).toEqual(INVALID_DRAW_POSITION_FOR_SEEDING);
  expect(recordCopy()).toEqual(before);
});

test('a LUCKY_DRAW payload with a second BYE is refused before any seat is written', () => {
  // a LUCKY_DRAW of 5 has 6 drawPositions
  const { drawId, structureId, participantIds } = setup({ drawSize: 5, drawType: LUCKY_DRAW, participantsCount: 4 });
  const positionAssignments = [
    { drawPosition: 1, participantId: participantIds[0] },
    { drawPosition: 2, bye: true },
    { drawPosition: 3, participantId: participantIds[1] },
    { drawPosition: 4, bye: true },
    { drawPosition: 5, participantId: participantIds[2] },
    { drawPosition: 6, participantId: participantIds[3] },
  ];

  const before = recordCopy();
  const result: any = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.error).toEqual(LUCKY_DRAW_BYE_LIMIT);
  expect(recordCopy()).toEqual(before);
});

test('a payload placing a BYE on a seat it has just filled is refused before any seat is written', () => {
  const { drawId, structureId, participantIds } = setup();
  const positionAssignments: any[] = [1, 2, 3, 4, 5, 6].map((drawPosition) => ({
    participantId: participantIds[drawPosition - 1],
    drawPosition,
  }));
  // seat 7 is reserved for a qualifier, then given a BYE; seat 8 is a BYE
  positionAssignments.push({ drawPosition: 7, qualifier: true }, { drawPosition: 8, bye: true });
  positionAssignments.push({ drawPosition: 7, bye: true });

  const before = recordCopy();
  let result: any = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.error).toEqual(DRAW_POSITION_ASSIGNED);
  expect(recordCopy()).toEqual(before);

  positionAssignments.pop();
  result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.success).toEqual(true);
});
