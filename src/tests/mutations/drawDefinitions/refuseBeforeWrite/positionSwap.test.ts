import { POLICY_SEEDING_DEFAULT } from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DRAW_POSITION_ACTIVE, INVALID_DRAW_POSITION_FOR_SEEDING } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

const policyDefinitions = {
  [POLICY_TYPE_SEEDING]: { ...POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING], validSeedPositions: { ignore: false } },
};

test('swapping an advanced participant with a BYE is refused before either seat is cleared', () => {
  // 8 draw, 6 participants: BYEs at 2 and 7; the 3-4 matchUp is played, so 3 or 4 has advanced
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        outcomes: [{ roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 1 }],
        participantsCount: 6,
        drawSize: 8,
      },
    ],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments } = drawDefinition.structures[0];
  const byePosition = positionAssignments.find((assignment) => assignment.bye).drawPosition;

  const before = recordCopy();
  let result: any = tournamentEngine.swapDrawPositionAssignments({
    drawPositions: [byePosition, 3],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
  expect(recordCopy()).toEqual(before);

  result = tournamentEngine.swapDrawPositionAssignments({ drawPositions: [byePosition, 5], structureId, drawId });
  expect(result.success).toEqual(true);
});

test('swapping a seed with a BYE outside its seed block is refused before either seat is cleared', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, seedsCount: 2 }],
    policyDefinitions,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments, seedAssignments } = drawDefinition.structures[0];
  const seedOne = seedAssignments.find(({ seedNumber }) => seedNumber === 1).participantId;
  const seedOnePosition = positionAssignments.find(({ participantId }) => participantId === seedOne).drawPosition;
  const seedTwo = seedAssignments.find(({ seedNumber }) => seedNumber === 2).participantId;
  const seedTwoPosition = positionAssignments.find(({ participantId }) => participantId === seedTwo).drawPosition;
  const byeBesideSeedTwo = seedTwoPosition % 2 ? seedTwoPosition + 1 : seedTwoPosition - 1;
  expect(positionAssignments.find(({ drawPosition }) => drawPosition === byeBesideSeedTwo).bye).toEqual(true);

  const before = recordCopy();
  const result: any = tournamentEngine.swapDrawPositionAssignments({
    drawPositions: [seedOnePosition, byeBesideSeedTwo],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DRAW_POSITION_FOR_SEEDING);
  expect(recordCopy()).toEqual(before);
});

test('a ROUND_ROBIN swap of an active participant with a BYE is refused, not reported as success', () => {
  // one group of 4 with 3 participants: one BYE; the group's first matchUp is played
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        structureOptions: { groupSize: 4 },
        drawType: ROUND_ROBIN,
        participantsCount: 3,
        drawSize: 4,
      },
    ],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: ['TO_BE_PLAYED'] },
  });
  const played = matchUps[0];
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { scoreString: '6-1 6-1', winningSide: 1 },
    matchUpId: played.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId } = drawDefinition.structures[0];
  const group = drawDefinition.structures[0].structures[0];
  const byePosition = group.positionAssignments.find((assignment) => assignment.bye).drawPosition;

  const before = recordCopy();
  result = tournamentEngine.swapDrawPositionAssignments({
    drawPositions: [byePosition, played.drawPositions[0]],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
  expect(recordCopy()).toEqual(before);
});
