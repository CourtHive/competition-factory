import { getDrawPosition } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';
import {
  getOrderedDrawPositionPairs,
  getContextMatchUp,
  removeAssignment,
} from '../../../drawDefinitions/testingUtilities';

// constants
import {
  ALTERNATE_PARTICIPANT,
  REMOVE_ASSIGNMENT,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

it('supports transitive BYE removal', () => {
  swapTest({ swapPosition: 4 });
  swapTest({ swapPosition: 3 });
});

it('supports transitive BYE removal in large structures', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 6,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;
  const originalPositionAssignments = structures[0].positionAssignments;

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const finalMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 3 && roundPosition === 1);
  if (finalMatchUp.drawPositions) {
    expect(finalMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  let { filteredOrderedPairs } = getOrderedDrawPositionPairs();
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  generateRange(5, 9).forEach((drawPosition) => {
    const participantId = originalPositionAssignments.find(
      (assignment) => assignment.drawPosition === drawPosition,
    ).participantId;
    if (participantId) {
      removeAssignment({
        drawId,
        structureId,
        drawPosition,
        replaceWithBye: true,
      });
    }
  });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [5, 7], // drawPositions 5, 6, 7, 8 are BYEs and 5, 7 are BYE-advanced
    [7], // drawPosition 7 is BYE-advanced
  ]);

  removeAssignment({
    drawId,
    structureId,
    drawPosition: 8,
  });
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [5], // drawPositions 5, 6 are BYEs and 5 is BYE-advanced
  ]);

  const participantId = originalPositionAssignments.find(({ drawPosition }) => drawPosition === 8).participantId;

  const result = tournamentEngine.assignDrawPosition({
    drawId,
    drawPosition: 8,
    structureId,
    participantId,
  });
  expect(result.success).toEqual(true);
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [5, 8], // drawPositions 5, 6 are BYEs and 5 is BYE-advanced
    [8],
  ]);

  const {
    drawDefinition: {
      structures: [updatedStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const byeDrawPositions = updatedStructure.positionAssignments.filter(({ bye }) => bye);
  expect(byeDrawPositions.length).toEqual(4);
});

// valid swapPositions for the expectations logic are 3 and 4
function swapTest({ swapPosition }) {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 6,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;
  const originalPositionAssignments = structures[0].positionAssignments;

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const finalMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 2 && roundPosition === 1);
  expect(finalMatchUp.drawPositions).toEqual([1, undefined]);
  let { filteredOrderedPairs } = getOrderedDrawPositionPairs();
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1], // drawPosition 1 is BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  removeAssignment({
    drawId,
    structureId,
    drawPosition: 3,
    replaceWithBye: true,
  });
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 4], // drawPositions 1 and 4 are both BYE-advanced
    [8], // drawPosition 8 is BYE-advanced
  ]);

  removeAssignment({
    drawId,
    structureId,
    drawPosition: 4,
    replaceWithBye: true,
  });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [1, 3],
    [8],
    [1], // drawPosition 4 is now a BYE, advancing 1
  ]);

  ({
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));
  const modifiedPositionAssignments = structures[0].positionAssignments;
  const originalByeAssignments = originalPositionAssignments.filter(({ bye }) => bye).map(getDrawPosition);
  const modifiedByeAssignments = modifiedPositionAssignments.filter(({ bye }) => bye).map(getDrawPosition);

  expect(originalByeAssignments).toEqual([2, 7]);
  expect(modifiedByeAssignments).toEqual([2, 3, 4, 7]);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const { matchUp } = getContextMatchUp({
    matchUps,
    roundNumber: 2,
    roundPosition: 1,
  });
  expect(matchUp.drawPositions).toEqual([1, 3]);

  swapPositions({ drawPosition: 5, swapPosition, drawId, structureId });

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs());
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4], // should be drawPosition 5's previous participantId and a bye
    [5, 6],
    [7, 8],
    [1, swapPosition], // should be drawPosition 5's previousy participantId paired with drawPosition: 1
    [6, 8],
  ]);
}

function swapPositions({ drawPosition, swapPosition, drawId, structureId }) {
  let result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(true);
  expect(options.includes(WITHDRAW_PARTICIPANT)).toEqual(true);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(true);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(true);

  const option = result.validActions.find((action) => action.type === SWAP_PARTICIPANTS);
  const availableSwapPositions = option.availableAssignments.map(({ drawPosition }) => drawPosition);
  expect(availableSwapPositions.includes(swapPosition));

  const payload = option.payload;
  payload.drawPositions.push(swapPosition);
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);
}
