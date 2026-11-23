import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  MISSING_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

// seed positions are enforced, so a seed placed outside its block is refused
const policyDefinitions = {
  [POLICY_TYPE_SEEDING]: { ...POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING], validSeedPositions: { ignore: false } },
};

// an 8 draw with 6 participants: two seats hold a BYE
function setup(drawProfile = {}) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, ...drawProfile }],
    policyDefinitions,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments } = drawDefinition.structures[0];
  const byePosition = positionAssignments.find((assignment) => assignment.bye).drawPosition;
  const placed = positionAssignments.filter((assignment) => assignment.participantId);
  return { drawId, structureId, byePosition, placed, drawDefinition };
}

test('placing an alternate already seated elsewhere onto a BYE is refused before the BYE is cleared', () => {
  const { drawId, structureId, byePosition, placed } = setup();

  const before = recordCopy();
  const result: any = tournamentEngine.alternateDrawPositionAssignment({
    alternateParticipantId: placed[0].participantId,
    drawPosition: byePosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(recordCopy()).toEqual(before);
});

test('placing a lucky loser with no participantId onto a BYE is refused before the BYE is cleared', () => {
  const { drawId, structureId, byePosition } = setup();

  const before = recordCopy();
  const result: any = tournamentEngine.luckyLoserDrawPositionAssignment({
    drawPosition: byePosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  expect(recordCopy()).toEqual(before);
});

test('placing a seeded participant onto a BYE outside its seed block is refused before the BYE is cleared', () => {
  const { drawId, structureId, drawDefinition } = setup({ seedsCount: 2 });
  const { seedAssignments, positionAssignments } = drawDefinition.structures[0];
  const seedOne = seedAssignments.find((assignment) => assignment.seedNumber === 1);
  // seed 1 and seed 2 each face a BYE; with seed positions enforced the BYE beside seed 2 is not a seed position
  const seedTwoPosition = positionAssignments.find(
    (assignment) => assignment.participantId === seedAssignments.find((a) => a.seedNumber === 2).participantId,
  ).drawPosition;
  const byeBesideSeedTwo = seedTwoPosition % 2 ? seedTwoPosition + 1 : seedTwoPosition - 1;
  expect(positionAssignments.find((assignment) => assignment.drawPosition === byeBesideSeedTwo).bye).toEqual(true);

  // seeding is asked before whether the participant is already seated, so seed 1 stays where it is
  const before = recordCopy();
  const result: any = tournamentEngine.alternateDrawPositionAssignment({
    alternateParticipantId: seedOne.participantId,
    drawPosition: byeBesideSeedTwo,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DRAW_POSITION_FOR_SEEDING);
  expect(recordCopy()).toEqual(before);
});
